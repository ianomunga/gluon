// jobs/connectInstance.js

import fs from 'fs'
import path from 'path'
import { exec, spawn } from 'child_process'
import open from 'open'
import waitOn from 'wait-on'
import { createClient } from '@supabase/supabase-js'
import { downloadPreviousNotebooks, uploadNotebooksToSupabase } from '../utils/notebooks.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function connectInstance(instance) {
  const { public_ip, ssh_username, pem_private_key, instance_id, session_id, user_id } = instance
  const keyName = `instance-${instance_id}.pem`
  const keyPath = path.join(process.env.HOME, '.ssh', keyName)

  fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 })
  if (!fs.existsSync(keyPath)) {
    fs.writeFileSync(keyPath, pem_private_key, { mode: 0o400 })
  }

  const localScript = path.resolve('scripts/bootstrap-ec2.sh')
  const remotePath = '/tmp/bootstrap-ec2.sh'

  // Restore any old notebooks
  await downloadPreviousNotebooks({ supabase, user_id, instance_id, ssh_username, public_ip, keyPath })

    // Path to the local logo
  const localLogoPath = path.resolve('assets/dataspiresLogo.svg')
  const remoteLogoPath = '~/dataspiresLogo.svg'

  // Upload the custom logo to EC2
  console.log('📤 Uploading custom logo...')
  await execPromise(`scp -i ${keyPath} -o StrictHostKeyChecking=no "${localLogoPath}" ${ssh_username}@${public_ip}:${remoteLogoPath}`)


  console.log('Uploading bootstrap script...')
  await execPromise(`scp -i ${keyPath} -o StrictHostKeyChecking=no "${localScript}" ${ssh_username}@${public_ip}:${remotePath}`)

  let shouldReconnect = false

  console.log('Running bootstrap script...')
  try {
    await execPromise(`ssh -i ${keyPath} -o StrictHostKeyChecking=no ${ssh_username}@${public_ip} "chmod +x ${remotePath} && sudo ${remotePath} '${process.env.SUPABASE_FUNCTION_URL}' '${process.env.SUPABASE_SERVICE_ROLE_KEY}' '${session_id}'"`)
  } catch (err) {
    if (err.code === 100 || err.message.includes("exit code 100")) {
      console.log('Reboot detected. Waiting for instance to come back...')
      shouldReconnect = true
      await waitForInstance(public_ip, ssh_username, keyPath)
    } else {
      throw err
    }
  }

  if (shouldReconnect) {
    console.log('Reconnecting and continuing setup...')
    await execPromise(`ssh -i ${keyPath} -o StrictHostKeyChecking=no ${ssh_username}@${public_ip} "sudo ${remotePath} '${process.env.SUPABASE_FUNCTION_URL}' '${process.env.SUPABASE_SERVICE_ROLE_KEY}' '${session_id}'"`)
  }

  // Now the session is ready, open Jupyter
  await openJupyterSession(instance, session_id)
}

// 🔄 Split-out function for launching and handling Jupyter session
export async function openJupyterSession(instance, session_id) {
  const { public_ip, ssh_username, instance_id, user_id } = instance
  const keyName = `instance-${instance_id}.pem`
  const keyPath = path.join(process.env.HOME, '.ssh', keyName)

  const sshCmd = [
    'ssh',
    '-i', keyPath,
    '-L', '8888:localhost:8888',
    '-o', 'StrictHostKeyChecking=no',
    `${ssh_username}@${public_ip}`,
    `"source ~/venvs/sshkernel-env/bin/activate && jupyter lab --no-browser --ip=0.0.0.0 --port=8888"`
  ]

  console.log('🔌 Establishing SSH tunnel to JupyterLab...')
  const sshProc = spawn(sshCmd.join(' '), {
    shell: true,
    stdio: ['inherit', 'pipe', 'pipe']
  })

  sshProc.stdout.on('data', data => console.log(`[SSH] ${data}`))
  sshProc.stderr.on('data', data => console.error(`[SSH ERROR] ${data}`))

  await waitOn({ resources: ['http://localhost:8888'], timeout: 30000 })
  await open('http://localhost:8888')

  sshProc.on('close', async (code) => {
    console.log(`SSH session closed (exit code ${code})`)
    const downloadDir = path.resolve('downloaded-sessions', session_id)
    fs.mkdirSync(downloadDir, { recursive: true })

    const scpDownloadCmd = `scp -i ${keyPath} -o StrictHostKeyChecking=no -r ${ssh_username}@${public_ip}:~/notebooks/*.ipynb "${downloadDir}"`
    console.log(`⬇ Downloading notebook files...`)
    await execPromise(scpDownloadCmd)

    await uploadNotebooksToSupabase({ supabase, session_id, user_id, localFolder: downloadDir })

    console.log('🧹 Terminating EC2 instance...')
    await supabase.from('terminated_instances').insert([{
      instance_id,
      user_id,
      session_id,
      terminated_at: new Date().toISOString(),
      notebooks_downloaded: true
    }])

    const terminateCmd = `aws ec2 terminate-instances --instance-ids ${instance_id} --region ${process.env.AWS_REGION}`
    await execPromise(terminateCmd)
    console.log('EC2 instance terminated.')
  })
}

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout
        err.stderr = stderr
        reject(err)
      } else {
        resolve(stdout)
      }
    })
  })
}

//Updated to use actual ssh_username and keyPath
async function waitForInstance(ip, ssh_username, keyPath) {
  let isUp = false
  const maxRetries = 30
  for (let i = 0; i < maxRetries; i++) {
    try {
      await execPromise(`ssh -i ${keyPath} -o StrictHostKeyChecking=no -o ConnectTimeout=5 ${ssh_username}@${ip} "echo up"`)
      isUp = true
      break
    } catch {
      console.log(`Waiting for ${ip} to reboot... (${i + 1}/${maxRetries})`)
      await new Promise(r => setTimeout(r, 10000))
    }
  }
  if (!isUp) throw new Error(`Instance at ${ip} did not come back online in time.`)
}

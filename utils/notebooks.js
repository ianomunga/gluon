// utils/notebooks.js

import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'

export async function uploadNotebooksToSupabase({ supabase, user_id, session_id, localFolder }) {
  const files = fs.readdirSync(localFolder).filter(file => file.endsWith('.ipynb'))

  for (const file of files) {
    const filePath = path.join(localFolder, file)
    const data = fs.readFileSync(filePath)

    const { error } = await supabase.storage
      .from('notebooks')
      .upload(`${user_id}/${session_id}/${file}`, data, { upsert: true })

    if (error) {
      console.error(`Failed to upload ${file}: ${error.message}`)
    } else {
      console.log(`Uploaded notebook: ${file}`)
    }
  }
}

export async function downloadPreviousNotebooks({ supabase, user_id, instance_id, ssh_username, public_ip, keyPath }) {
  const { data: sessions, error } = await supabase
    .from('terminated_instances')
    .select('session_id')
    .eq('user_id', user_id)
    .order('terminated_at', { ascending: false })
    .limit(1)

  if (error || !sessions?.length) {
    console.log('No previous sessions to restore.')
    return false
  }

  const sessionId = sessions[0].session_id
  const { data: list, error: storageError } = await supabase.storage
    .from('notebooks')
    .list(`${user_id}/${sessionId}`)

  if (storageError || !list.length) {
    console.log('No notebooks to restore from storage.')
    return false
  }

  const tmpDir = path.resolve('tmp-downloads', sessionId)
  fs.mkdirSync(tmpDir, { recursive: true })

  console.log('Downloading prior notebooks to temp dir...')
  for (const file of list) {
    const { data, error } = await supabase.storage
      .from('notebooks')
      .download(`${user_id}/${sessionId}/${file.name}`)

    if (error) continue
    const filePath = path.join(tmpDir, file.name)
    fs.writeFileSync(filePath, Buffer.from(await data.arrayBuffer()))
  }

  // Push to EC2
  const scpUploadCmd = `scp -i ${keyPath} -o StrictHostKeyChecking=no -r ${tmpDir}/*.ipynb ${ssh_username}@${public_ip}:~/notebooks/`
  await execPromise(scpUploadCmd)

  console.log('Notebooks restored into new EC2 instance.')
  return true
}

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdout, stderr) => {
      if (err) reject(err)
      else resolve(stdout)
    })
  })
}

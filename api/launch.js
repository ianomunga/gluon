// api/launch.js
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { EC2Client, ImportKeyPairCommand, RunInstancesCommand, DescribeImagesCommand } from '@aws-sdk/client-ec2'
import crypto from 'crypto'
import { Buffer } from 'buffer'

const router = express.Router()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ec2 = new EC2Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
})

router.post('/', async (req, res) => {
  const { instanceType, amiId, region, token } = req.body

  if (!token || !instanceType || !amiId) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  // Validate token with Supabase
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Generate key pair
    const key = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    })

    const keyName = `supabase-key-${crypto.randomUUID()}`
    const publicKeyBase64 = Buffer.from(key.publicKey).toString('base64')

    // Import key to AWS
    await ec2.send(new ImportKeyPairCommand({
      KeyName: keyName,
      PublicKeyMaterial: publicKeyBase64
    }))

    // Launch instance
    const launchRes = await ec2.send(new RunInstancesCommand({
      ImageId: amiId,
      InstanceType: instanceType,
      KeyName: keyName,
      MinCount: 1,
      MaxCount: 1
    }))

    const instance = launchRes.Instances?.[0]
    const instanceId = instance?.InstanceId
    const publicIp = instance?.PublicIpAddress

    if (!instanceId || !publicIp) {
      return res.status(500).json({ error: 'Failed to retrieve EC2 instance data' })
    }

    // Get SSH username
    const describe = await ec2.send(new DescribeImagesCommand({ ImageIds: [amiId] }))
    const image = describe.Images?.[0]
    const amiName = image?.Name || image?.Description || 'Custom AMI'

    const amiUsernames = {
      'Ubuntu': 'ubuntu', 'Amazon Linux': 'ec2-user',
      'Debian': 'admin', 'CentOS': 'centos', 'RHEL': 'ec2-user',
      'Fedora': 'fedora', 'SUSE': 'ec2-user', 'Bitnami': 'bitnami',
      'TurnKey': 'root', 'AlmaLinux': 'ec2-user', 'Rocky': 'ec2-user'
    }

    const sshUsername = Object.entries(amiUsernames).find(([key]) => amiName.includes(key))?.[1] || 'ec2-user'

    const sshConnection = `ssh -i ~/.ssh/${keyName}.pem ${sshUsername}@${publicIp}`

    // Insert into Supabase
    const { error: insertErr } = await supabase.from('instances').insert([{
      user_id: user.id,
      instance_id: instanceId,
      public_ip: publicIp,
      ssh_username: sshUsername,
      ssh_connection_string: sshConnection,
      pem_private_key: key.privateKey,
      status: 'launched'
    }])

    if (insertErr) {
      return res.status(500).json({ error: `Supabase insert failed: ${insertErr.message}` })
    }

    return res.status(200).json({
      message: 'EC2 instance launched',
      instance_id: instanceId,
      public_ip: publicIp
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Unexpected error launching instance' })
  }
})

export default router

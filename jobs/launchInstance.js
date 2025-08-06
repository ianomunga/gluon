// jobs/launchInstance.js
import { randomUUID } from 'crypto'
import { generateKeyPairSync } from 'crypto'
import supabase from '../services/supabase.js'
import { getSignedAwsEc2Request } from '../lib/awsEc2Signer.js'
import fetch from 'node-fetch' 

const amiToUsernameMap = {
  "Amazon Linux": "ec2-user",
  "Amazon Linux 2": "ec2-user",
  "Amazon Linux 2023": "ec2-user",
  "Ubuntu 16.04": "ubuntu",
  "Ubuntu 18.04": "ubuntu",
  "Ubuntu 20.04": "ubuntu",
  "Ubuntu 22.04": "ubuntu",
  "Debian 9": "admin",
  "Debian 10": "admin",
  "Debian 11": "admin",
  "Debian (older versions)": "debian",
  "RHEL 7": "ec2-user",
  "RHEL 8": "ec2-user",
  "RHEL 9": "ec2-user",
  "CentOS 7": "centos",
  "CentOS 8": "centos",
  "Fedora": "fedora",
  "SUSE Linux Enterprise Server (SLES)": "ec2-user",
  "openSUSE": "ec2-user",
  "FreeBSD": "ec2-user",
  "FreeBSD (older versions)": "freebsd",
  "Bitnami": "bitnami",
  "TurnKey Linux": "root",
  "AlmaLinux": "ec2-user",
  "Rocky Linux": "ec2-user",
  "Arch Linux": "ec2-user",
  "NixOS": "ec2-user",
  "Gentoo": "ec2-user",
  "Clear Linux": "clear",
  "Windows": "Administrator",
  "Custom AMI": "ec2-user"
}

async function fetchAmiName(amiId, region, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) {
  const bodyParams = {
    Action: "DescribeImages",
    ImageId: amiId,
    Version: "2016-11-15"
  }

  const signedRequest = await getSignedAwsEc2Request({
    method: 'POST',
    region,
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    service: 'ec2',
    action: 'DescribeImages',
    bodyParams,
  })

  const response = await fetch(signedRequest.url, {
    method: 'POST',
    headers: signedRequest.headers,
    body: signedRequest.body,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch AMI info: ${await response.text()}`)
  }

  const text = await response.text()

  // Extract AMI Name from XML response using regex
  const match = text.match(/<name>([^<]+)<\/name>/)
  if (!match) {
    throw new Error('AMI name not found in DescribeImages response')
  }
  return match[1]
}

function determineSshUsernameFromAmiName(amiName) {
  const lowerAmiName = amiName.toLowerCase()
  for (const [prefix, username] of Object.entries(amiToUsernameMap)) {
    const cleanedPrefix = prefix.toLowerCase().replace(/\s*\(.*\)/, '') // remove anything in parentheses
    if (lowerAmiName.includes(cleanedPrefix)) {
      return username
    }
  }
  return 'ubuntu' // default fallback
}

export async function launchInstance(request) {
  const { user_id, instance_type, ami_id, region = 'us-east-1' } = request

  try {
    console.log(`Launching EC2 instance for user ${user_id}...`)

    const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID
    const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY

    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not set in environment variables')
    }

    // Get AMI name dynamically
    const amiName = await fetchAmiName(ami_id, region, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    console.log(`Fetched AMI name: ${amiName}`)

    const sshUsername = determineSshUsernameFromAmiName(amiName)
    console.log(`Determined SSH username: ${sshUsername}`)

    // Generate SSH keypair
    const keyName = `supabase-key-${randomUUID()}`
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })

    // Import public key to EC2
    const importRes = await getSignedAwsEc2Request({
      method: 'POST',
      region,
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      service: 'ec2',
      action: 'ImportKeyPair',
      bodyParams: {
        KeyName: keyName,
        PublicKeyMaterial: Buffer.from(publicKey).toString('base64'),
      },
    })

    const importResponse = await fetch(importRes.url, {
      method: 'POST',
      headers: importRes.headers,
      body: importRes.body,
    })

    if (!importResponse.ok) {
      throw new Error(`ImportKeyPair failed: ${await importResponse.text()}`)
    }

    // Launch the EC2 instance
    const launchRes = await getSignedAwsEc2Request({
      method: 'POST',
      region,
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
      service: 'ec2',
      action: 'RunInstances',
      bodyParams: {
        ImageId: ami_id,
        InstanceType: instance_type,
        KeyName: keyName,
        MinCount: 1,
        MaxCount: 1,
      },
    })

    const ec2Response = await fetch(launchRes.url, {
      method: 'POST',
      headers: launchRes.headers,
      body: launchRes.body,
    })

    const ec2Json = await ec2Response.json()
    const instance = ec2Json?.RunInstancesResponse?.instancesSet?.item
    const instanceId = instance?.instanceId
    const publicIp = instance?.ipAddress

    if (!instanceId || !publicIp) {
      throw new Error('Invalid EC2 launch response')
    }

    // Save instance info in Supabase
    const sshConnectionString = `ssh -i ~/.ssh/${keyName}.pem ${sshUsername}@${publicIp}`

    await supabase.from('instances').insert([{
      user_id,
      instance_id: instanceId,
      public_ip: publicIp,
      ssh_username: sshUsername,
      ssh_connection_string: sshConnectionString,
      pem_private_key: privateKey,
    }])

    // Update launch_queue status to complete
    await supabase.from('launch_queue')
      .update({ status: 'complete', message: 'Instance launched' })
      .eq('id', request.id)

    console.log(`Instance ${instanceId} launched for user ${user_id}`)

  } catch (err) {
    console.error(`Error launching instance for user ${user_id}:`, err)
    await supabase.from('launch_queue')
      .update({ status: 'error', message: String(err.message) })
      .eq('id', request.id)
  }
}

// jobs/bootT4Instance.js
import AWS from 'aws-sdk';
import { insertInstanceMetadata } from '../lib/db.js';

const T4_INSTANCE_ID = 'i-0c402f1308d95785a';
const REGION = 'us-east-1';
const ec2 = new AWS.EC2({ region: REGION });

export async function bootT4Instance(request) {
  try {
    const describe = await ec2.describeInstances({
      InstanceIds: [T4_INSTANCE_ID]
    }).promise();

    const state = describe.Reservations[0].Instances[0].State.Name;
    console.log(`Current state of T4 instance: ${state}`);

    if (state !== 'running') {
      console.log('Starting T4 instance...');
      await ec2.startInstances({ InstanceIds: [T4_INSTANCE_ID] }).promise();
    }

    const instanceData = describe.Reservations[0].Instances[0];
    await insertInstanceMetadata({
      user_id: request.user_id,
      instance_id: T4_INSTANCE_ID,
      ip_address: instanceData.PublicIpAddress || 'pending',
      instance_type: 'g4dn.2xlarge',
      ami_id: 'ami-0a7d80731ae1b2435',
      is_ready: false
    });

  } catch (err) {
    console.error('❌ Failed to boot T4 instance:', err);
  }
}

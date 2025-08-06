// listeners/launchRequests.js

import { createClient } from '@supabase/supabase-js'
import { connectInstance } from '../jobs/connectInstance.js'

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function listenToLaunchRequests() {
  console.log('Listening for new EC2 launch requests...')

  const channel = supabase
    .channel('ec2-instance-launches')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'instances',
      },
      async (payload) => {
        const newRow = payload.new
        console.log(`New instance row inserted: ${newRow.instance_id}`)

        if (newRow.status === 'launched') {
          console.log('Instance launched! Connecting...')
          await connectInstance(newRow)
        } else {
          console.log(`Skipping instance ${newRow.instance_id}, status: ${newRow.status}`)
        }
      }
    )
    .subscribe((status) => {
      console.log(`Subscribed to instance launches: ${status}`)
    })
}

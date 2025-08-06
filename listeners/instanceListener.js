// listeners/instanceListener.js
import { exec } from 'child_process'
import supabase from '../services/supabase.js'

export function listenToInstanceEvents() {
  console.log("Listening for EC2 instance creation events...")

  const channel = supabase
    .channel('instance-events')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'instances',
      },
      async (payload) => {
        const instance = payload.new
        const userId = instance.user_id
        if (!userId) {
          console.warn("Received instance event without user_id")
          return
        }

        console.log(`Instance created for user: ${userId}. Running connect script...`)

        exec(`./connect-instance.sh ${userId}`, (err, stdout, stderr) => {
          if (err) {
            console.error(`SSH failed for user ${userId}:`, err)
            return
          }

          console.log(`SSH success for ${userId}:\n${stdout}`)
          if (stderr) console.warn(stderr)
        })
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('Subscribed to instance event channel')
      } else {
        console.error('Failed to subscribe to Supabase Realtime')
      }
    })
}

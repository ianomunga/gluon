// listeners/sessionListener.js
import supabase from '../services/supabase.js'
import { openJupyterSession } from '../jobs/connectInstance.js'

export function listenToSessionReady() {
  console.log('Listening for ready sessions...')

  supabase
    .channel('session-ready')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'sessions',
      filter: 'is_ready=eq.true'
    }, async (payload) => {
      const session = payload.new
      const { user_id, id: session_id } = session

      console.log(`Session ${session_id} for user ${user_id} marked ready.`)

      const { data: instance, error } = await supabase
        .from('instances')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !instance) {
        console.error(`Failed to find instance for session ${session_id}:`, error)
        return
      }

      await openJupyterSession(instance, session_id)
    })
    .subscribe(status => console.log(`Subscribed to session-ready changes: ${status}`))
}

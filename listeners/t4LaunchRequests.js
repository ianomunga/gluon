// listeners/t4LaunchRequests.js
import { createClient } from '@supabase/supabase-js';
import { bootT4Instance } from '../jobs/bootT4Instance.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

export async function listenToT4LaunchQueue() {
  const channel = supabase.channel('t4-launch-queue-listener')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 't4_launch_queue'
    }, async (payload) => {
      const request = payload.new;
      console.log('🚀 Launch request detected (T4):', request);
      await bootT4Instance(request);
    });

  await channel.subscribe();
}

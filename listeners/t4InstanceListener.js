const { createClient } = require('@supabase/supabase-js');
const { runConnectScript } = require('../lib/sshUtils');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function listenToT4InstanceTable() {
  const channel = supabase
    .channel('t4_instance_listener')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'instances',
      filter: 'is_ready=eq.false',
    }, async (payload) => {
      const { public_ip, user_id, instance_id } = payload.new;
      console.log('[T4 Instance Listener] Preparing SSH connection to:', public_ip);
      await runConnectScript(public_ip, user_id);
    })
    .subscribe();
}

module.exports = { listenToT4InstanceTable };

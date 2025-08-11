// api/launch.js
import express from 'express'
import { createClient } from '@supabase/supabase-js'

const router = express.Router()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

router.post('/', async (req, res) => {
  const { user_id, instance_type, ami_id } = req.body

  if (!user_id || !instance_type || !ami_id) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  try {
    // Insert into t4_launch_queue
    const { error } = await supabase.from('t4_launch_queue').insert([
      {
        user_id,
        instance_type,
        ami_id
      }
    ])

    if (error) {
      console.error('Supabase insert error:', error.message)
      return res.status(500).json({ error: 'Failed to queue instance launch' })
    }

    return res.status(200).json({
      message: 'Launch request queued successfully'
    })
  } catch (err) {
    console.error('API Error:', err)
    return res.status(500).json({ error: 'Unexpected error queuing launch' })
  }
})

export default router

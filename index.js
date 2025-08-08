// index.js

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { listenToLaunchRequests } from './listeners/launchRequests.js'
import { listenToInstanceEvents } from './listeners/instanceListener.js'
import { listenToSessionReady } from './listeners/sessionListener.js'
import launchRouter from './api/launch.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// Health check route — used by Cloudflare Worker to confirm server is live
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' })
})

// Mount the launch API route for Webflow or frontend use
app.use('/api/launch', launchRouter)

// Start HTTP server
app.listen(PORT, () => {
  console.log(`Automation server running on http://localhost:${PORT}`)
})

// Start Supabase listeners
console.log('Listening to Supabase database events...')
listenToLaunchRequests()
listenToInstanceEvents()
listenToSessionReady()

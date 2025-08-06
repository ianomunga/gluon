// index.js

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { listenToLaunchRequests } from './listeners/launchRequests.js'
import { listenToInstanceEvents } from './listeners/instanceListener.js'
import launchRouter from './api/launch.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// Mount the launch API route
app.use('/api/launch', launchRouter)

app.listen(PORT, () => {
  console.log(`Automation server running on http://localhost:${PORT}`)
})

// Start Supabase DB listeners
console.log('Listening to Supabase instance events...')
listenToLaunchRequests()
listenToInstanceEvents()

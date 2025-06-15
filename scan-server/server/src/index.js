import express from "express"
import cors from "cors"
import helmet from "helmet"
import { createServer } from "http"
import { Server } from "socket.io"
import { supabase } from "./config/database.js"
import { authRoutes } from "./routes/auth.js"
import { campaignRoutes } from "./routes/campaigns.js"
import { qrRoutes } from "./routes/qr.js"
import { trackingRoutes } from "./routes/tracking.js"
import { analyticsRoutes } from "./routes/analytics.js"
import { publicApiRoutes } from "./routes/api/v1/index.js"
import { setupSocketIO } from "./services/socketService.js"
import { errorHandler } from "./middleware/errorHandler.js"

const app = express()
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
})

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))

// Make io available to routes
app.set("io", io)

// Routes
app.use("/auth", authRoutes)
app.use("/campaigns", campaignRoutes)
app.use("/qr", qrRoutes)
app.use("/track", trackingRoutes)
app.use("/analytics", analyticsRoutes)
app.use("/api/v1", publicApiRoutes)

// Public QR handler route
app.get("/q/:slug", async (req, res) => {
  try {
    const { slug } = req.params

    // Get QR code and campaign data
    const { data: qrCode, error } = await supabase
      .from("qr_codes")
      .select(`
        *,
        campaigns (
          id,
          type,
          config,
          forms (*)
        )
      `)
      .eq("slug", slug)
      .eq("is_active", true)
      .single()

    if (error || !qrCode) {
      return res.status(404).send("QR Code not found")
    }

    // Check expiration
    if (qrCode.expires_at && new Date(qrCode.expires_at) < new Date()) {
      return res.status(410).send("QR Code has expired")
    }

    // Serve the QR handler page
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Scanradar</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
          <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body>
          <div id="root"></div>
          <script>
            window.qrData = ${JSON.stringify(qrCode)};
            window.apiUrl = '${process.env.API_URL || "http://localhost:5000"}';
          </script>
          <script src="/static/qr-handler.js"></script>
        </body>
      </html>
    `)
  } catch (error) {
    console.error("QR handler error:", error)
    res.status(500).send("Internal server error")
  }
})

// Static files
app.use("/static", express.static("public"))

// Error handling
app.use(errorHandler)

// Setup Socket.IO
setupSocketIO(io)

const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`Scanradar server running on port ${PORT}`)
})

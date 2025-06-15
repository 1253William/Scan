import jwt from "jsonwebtoken"
import { supabase } from "../config/database.js"

export function setupSocketIO(io) {
  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token

      if (!token) {
        return next(new Error("Authentication error"))
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      socket.userId = decoded.userId
      next()
    } catch (err) {
      next(new Error("Authentication error"))
    }
  })

  io.on("connection", (socket) => {
    console.log(`User ${socket.userId} connected`)

    // Join campaign rooms
    socket.on("join_campaign", async (campaignId) => {
      try {
        // Verify user owns the campaign
        const { data: campaign, error } = await supabase
          .from("campaigns")
          .select("id")
          .eq("id", campaignId)
          .eq("user_id", socket.userId)
          .single()

        if (error || !campaign) {
          socket.emit("error", { message: "Campaign not found" })
          return
        }

        socket.join(`campaign:${campaignId}`)
        socket.emit("joined_campaign", { campaignId })
      } catch (error) {
        console.error("Join campaign error:", error)
        socket.emit("error", { message: "Failed to join campaign" })
      }
    })

    // Leave campaign rooms
    socket.on("leave_campaign", (campaignId) => {
      socket.leave(`campaign:${campaignId}`)
      socket.emit("left_campaign", { campaignId })
    })

    socket.on("disconnect", () => {
      console.log(`User ${socket.userId} disconnected`)
    })
  })

  // Listen to PostgreSQL notifications
  setupPostgresNotifications(io)
}

async function setupPostgresNotifications(io) {
  try {
    // Create a dedicated connection for listening to notifications
    const { createClient } = await import("pg")
    const client = createClient({
      connectionString: process.env.DATABASE_URL,
    })

    await client.connect()

    // Listen for scan events
    await client.query("LISTEN scan_event")
    await client.query("LISTEN form_submission")

    client.on("notification", (msg) => {
      try {
        const payload = JSON.parse(msg.payload)

        if (msg.channel === "scan_event") {
          io.to(`campaign:${payload.campaign_id}`).emit("scan_event", {
            type: "scan",
            campaignId: payload.campaign_id,
            qrCodeId: payload.qr_code_id,
            timestamp: payload.data.created_at,
            location: payload.data.location_data?.city,
            device: payload.data.metadata?.device?.type || "desktop",
          })
        } else if (msg.channel === "form_submission") {
          io.to(`campaign:${payload.campaign_id}`).emit("form_submission", {
            type: "form_submission",
            campaignId: payload.campaign_id,
            formId: payload.form_id,
            timestamp: payload.data.created_at,
          })
        }
      } catch (error) {
        console.error("Notification processing error:", error)
      }
    })

    console.log("PostgreSQL notifications listener setup complete")
  } catch (error) {
    console.error("Failed to setup PostgreSQL notifications:", error)
  }
}

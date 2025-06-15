import express from "express"
import QRCode from "qrcode"
import { supabase } from "../config/database.js"
import { authenticateToken } from "../middleware/auth.js"
import { generateSlug } from "../utils/slug.js"

const router = express.Router()

// Apply authentication to all routes
router.use(authenticateToken)

// Create QR code
router.post("/", async (req, res) => {
  try {
    const { campaignId, name, settings = {}, expiresAt } = req.body

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .eq("user_id", req.user.userId)
      .single()

    if (campaignError || !campaign) {
      return res.status(404).json({ error: "Campaign not found" })
    }

    // Generate unique slug
    const slug = await generateSlug()

    const { data: qrCode, error } = await supabase
      .from("qr_codes")
      .insert([
        {
          campaign_id: campaignId,
          slug,
          name,
          settings,
          expires_at: expiresAt,
        },
      ])
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json(qrCode)
  } catch (error) {
    console.error("Create QR code error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Generate QR code image
router.get("/:id/image", async (req, res) => {
  try {
    const { data: qrCode, error } = await supabase
      .from("qr_codes")
      .select(`
        *,
        campaigns!inner (user_id)
      `)
      .eq("id", req.params.id)
      .eq("campaigns.user_id", req.user.userId)
      .single()

    if (error || !qrCode) {
      return res.status(404).json({ error: "QR code not found" })
    }

    const qrUrl = `${process.env.BASE_URL || "http://localhost:5000"}/q/${qrCode.slug}`

    const qrOptions = {
      type: "png",
      quality: 0.92,
      margin: 1,
      color: {
        dark: qrCode.settings.color || "#000000",
        light: qrCode.settings.backgroundColor || "#FFFFFF",
      },
      width: qrCode.settings.size || 256,
    }

    const qrBuffer = await QRCode.toBuffer(qrUrl, qrOptions)

    res.set({
      "Content-Type": "image/png",
      "Content-Length": qrBuffer.length,
      "Cache-Control": "public, max-age=31536000",
    })

    res.send(qrBuffer)
  } catch (error) {
    console.error("Generate QR image error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get QR codes for campaign
router.get("/campaign/:campaignId", async (req, res) => {
  try {
    const { data: qrCodes, error } = await supabase
      .from("qr_codes")
      .select(`
        *,
        campaigns!inner (user_id)
      `)
      .eq("campaign_id", req.params.campaignId)
      .eq("campaigns.user_id", req.user.userId)
      .order("created_at", { ascending: false })

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json(qrCodes)
  } catch (error) {
    console.error("Get QR codes error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Update QR code
router.put("/:id", async (req, res) => {
  try {
    const { name, settings, expiresAt, isActive } = req.body

    const { data: qrCode, error } = await supabase
      .from("qr_codes")
      .update({
        name,
        settings,
        expires_at: expiresAt,
        is_active: isActive,
      })
      .eq("id", req.params.id)
      .select(`
        *,
        campaigns!inner (user_id)
      `)
      .eq("campaigns.user_id", req.user.userId)
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    if (!qrCode) {
      return res.status(404).json({ error: "QR code not found" })
    }

    res.json(qrCode)
  } catch (error) {
    console.error("Update QR code error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export { router as qrRoutes }

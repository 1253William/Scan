import express from "express"
import geoip from "geoip-lite"
import UAParser from "ua-parser-js"
import { supabase } from "../config/database.js"
import { generateUUID } from "../utils/uuid.js"

const router = express.Router()

// Track QR code scan
router.post("/:slug", async (req, res) => {
  try {
    const { slug } = req.params
    const { userUuid, metadata = {} } = req.body

    // Get QR code and campaign
    const { data: qrCode, error } = await supabase
      .from("qr_codes")
      .select(`
        *,
        campaigns (id, user_id)
      `)
      .eq("slug", slug)
      .eq("is_active", true)
      .single()

    if (error || !qrCode) {
      return res.status(404).json({ error: "QR code not found" })
    }

    // Check expiration
    if (qrCode.expires_at && new Date(qrCode.expires_at) < new Date()) {
      return res.status(410).json({ error: "QR code has expired" })
    }

    // Get client info
    const ip = req.ip || req.connection.remoteAddress
    const userAgent = req.get("User-Agent")
    const ua = UAParser(userAgent)
    const location = geoip.lookup(ip)

    // Generate UUID if not provided
    const finalUserUuid = userUuid || generateUUID()

    // Create scan event
    const { data: scanEvent, error: scanError } = await supabase
      .from("scan_events")
      .insert([
        {
          qr_code_id: qrCode.id,
          campaign_id: qrCode.campaigns.id,
          user_uuid: finalUserUuid,
          ip_address: ip,
          user_agent: userAgent,
          browser_fingerprint: generateBrowserFingerprint(ua),
          location_data: location,
          metadata: {
            ...metadata,
            browser: ua.browser,
            os: ua.os,
            device: ua.device,
          },
        },
      ])
      .select()
      .single()

    if (scanError) {
      console.error("Scan event creation error:", scanError)
      return res.status(500).json({ error: "Failed to record scan" })
    }

    // Emit real-time event
    const io = req.app.get("io")
    io.to(`campaign:${qrCode.campaigns.id}`).emit("scan_event", {
      type: "scan",
      qrCodeId: qrCode.id,
      campaignId: qrCode.campaigns.id,
      timestamp: scanEvent.created_at,
      location: location?.city,
      device: ua.device?.type || "desktop",
    })

    res.json({
      success: true,
      userUuid: finalUserUuid,
      scanId: scanEvent.id,
    })
  } catch (error) {
    console.error("Track scan error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Submit form
router.post("/form/:formId", async (req, res) => {
  try {
    const { formId } = req.params
    const { data, userUuid, qrCodeId, metadata = {} } = req.body

    // Verify form exists
    const { data: form, error } = await supabase
      .from("forms")
      .select(`
        *,
        campaigns (id, user_id)
      `)
      .eq("id", formId)
      .single()

    if (error || !form) {
      return res.status(404).json({ error: "Form not found" })
    }

    // Create form submission
    const { data: submission, error: submissionError } = await supabase
      .from("form_submissions")
      .insert([
        {
          form_id: formId,
          qr_code_id: qrCodeId,
          user_uuid: userUuid,
          data,
          metadata,
        },
      ])
      .select()
      .single()

    if (submissionError) {
      return res.status(400).json({ error: submissionError.message })
    }

    // Emit real-time event
    const io = req.app.get("io")
    io.to(`campaign:${form.campaigns.id}`).emit("form_submission", {
      type: "form_submission",
      formId: formId,
      campaignId: form.campaigns.id,
      timestamp: submission.created_at,
      data: data,
    })

    res.json({
      success: true,
      submissionId: submission.id,
    })
  } catch (error) {
    console.error("Form submission error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

function generateBrowserFingerprint(ua) {
  const components = [
    ua.browser.name,
    ua.browser.version,
    ua.os.name,
    ua.os.version,
    ua.device.vendor,
    ua.device.model,
  ].filter(Boolean)

  return components.join("|")
}

export { router as trackingRoutes }

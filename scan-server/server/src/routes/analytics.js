import express from "express"
import { supabase } from "../config/database.js"
import { authenticateToken } from "../middleware/auth.js"

const router = express.Router()

// Apply authentication to all routes
router.use(authenticateToken)

// Get campaign analytics
router.get("/campaign/:campaignId", async (req, res) => {
  try {
    const { campaignId } = req.params
    const { timeframe = "7d" } = req.query

    // Verify campaign ownership
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, name, type")
      .eq("id", campaignId)
      .eq("user_id", req.user.userId)
      .single()

    if (campaignError || !campaign) {
      return res.status(404).json({ error: "Campaign not found" })
    }

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()

    switch (timeframe) {
      case "24h":
        startDate.setHours(startDate.getHours() - 24)
        break
      case "7d":
        startDate.setDate(startDate.getDate() - 7)
        break
      case "30d":
        startDate.setDate(startDate.getDate() - 30)
        break
      case "90d":
        startDate.setDate(startDate.getDate() - 90)
        break
      default:
        startDate.setDate(startDate.getDate() - 7)
    }

    // Get scan events
    const { data: scanEvents, error: scanError } = await supabase
      .from("scan_events")
      .select("*")
      .eq("campaign_id", campaignId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: true })

    if (scanError) {
      return res.status(400).json({ error: scanError.message })
    }

    // Get form submissions if it's a form campaign
    let formSubmissions = []
    if (campaign.type === "form") {
      const { data: submissions, error: submissionError } = await supabase
        .from("form_submissions")
        .select(`
          *,
          forms!inner (campaign_id)
        `)
        .eq("forms.campaign_id", campaignId)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())

      if (!submissionError) {
        formSubmissions = submissions || []
      }
    }

    // Calculate analytics
    const analytics = calculateAnalytics(scanEvents, formSubmissions, timeframe)

    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        type: campaign.type,
      },
      timeframe,
      analytics,
    })
  } catch (error) {
    console.error("Analytics error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get dashboard overview
router.get("/dashboard", async (req, res) => {
  try {
    const userId = req.user.userId

    // Get all campaigns for user
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id, name, type, created_at")
      .eq("user_id", userId)

    if (campaignsError) {
      return res.status(400).json({ error: campaignsError.message })
    }

    const campaignIds = campaigns.map((c) => c.id)

    // Get recent scan events
    const { data: recentScans, error: scansError } = await supabase
      .from("scan_events")
      .select(`
        *,
        qr_codes (name, slug),
        campaigns (name)
      `)
      .in("campaign_id", campaignIds)
      .order("created_at", { ascending: false })
      .limit(10)

    if (scansError) {
      return res.status(400).json({ error: scansError.message })
    }

    // Get total stats
    const { count: totalScans } = await supabase
      .from("scan_events")
      .select("*", { count: "exact", head: true })
      .in("campaign_id", campaignIds)

    const { count: totalSubmissions } = await supabase
      .from("form_submissions")
      .select(
        `
        *,
        forms!inner (campaign_id)
      `,
        { count: "exact", head: true },
      )
      .in("forms.campaign_id", campaignIds)

    res.json({
      overview: {
        totalCampaigns: campaigns.length,
        totalScans: totalScans || 0,
        totalSubmissions: totalSubmissions || 0,
        activeCampaigns: campaigns.filter((c) => c.status === "active").length,
      },
      recentScans: recentScans || [],
      campaigns: campaigns,
    })
  } catch (error) {
    console.error("Dashboard analytics error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

function calculateAnalytics(scanEvents, formSubmissions, timeframe) {
  const totalScans = scanEvents.length
  const uniqueUsers = new Set(scanEvents.map((e) => e.user_uuid)).size
  const totalSubmissions = formSubmissions.length

  // Calculate conversion rate
  const conversionRate = totalScans > 0 ? (totalSubmissions / totalScans) * 100 : 0

  // Group by time periods
  const timeGroups = groupByTimePeriod(scanEvents, timeframe)
  const submissionGroups = groupByTimePeriod(formSubmissions, timeframe)

  // Device breakdown
  const deviceBreakdown = scanEvents.reduce((acc, event) => {
    const device = event.metadata?.device?.type || "desktop"
    acc[device] = (acc[device] || 0) + 1
    return acc
  }, {})

  // Location breakdown
  const locationBreakdown = scanEvents.reduce((acc, event) => {
    const location = event.location_data?.city || "Unknown"
    acc[location] = (acc[location] || 0) + 1
    return acc
  }, {})

  return {
    totals: {
      scans: totalScans,
      uniqueUsers,
      submissions: totalSubmissions,
      conversionRate: Math.round(conversionRate * 100) / 100,
    },
    timeline: {
      scans: timeGroups,
      submissions: submissionGroups,
    },
    breakdowns: {
      devices: deviceBreakdown,
      locations: locationBreakdown,
    },
  }
}

function groupByTimePeriod(events, timeframe) {
  const groups = {}
  const format = timeframe === "24h" ? "hour" : "day"

  events.forEach((event) => {
    const date = new Date(event.created_at)
    let key

    if (format === "hour") {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:00`
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
    }

    groups[key] = (groups[key] || 0) + 1
  })

  return groups
}

export { router as analyticsRoutes }

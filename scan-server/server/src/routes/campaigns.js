import express from "express"
import { supabase } from "../config/database.js"
import { authenticateToken } from "../middleware/auth.js"

const router = express.Router()

// Apply authentication to all routes
router.use(authenticateToken)

// Get all campaigns for user
router.get("/", async (req, res) => {
  try {
    const { data: campaigns, error } = await supabase
      .from("campaigns")
      .select(`
        *,
        qr_codes (
          id,
          slug,
          name,
          is_active,
          created_at
        ),
        forms (
          id,
          title
        )
      `)
      .eq("user_id", req.user.userId)
      .order("created_at", { ascending: false })

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json(campaigns)
  } catch (error) {
    console.error("Get campaigns error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Create campaign
router.post("/", async (req, res) => {
  try {
    const { name, type, config = {} } = req.body
    const userId = req.user.userId

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert([
        {
          user_id: userId,
          name,
          type,
          config,
        },
      ])
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    // If it's a form campaign, create the form
    if (type === "form") {
      const { data: form, error: formError } = await supabase
        .from("forms")
        .insert([
          {
            campaign_id: campaign.id,
            title: config.title || name,
            description: config.description || "",
            fields: config.fields || [],
          },
        ])
        .select()
        .single()

      if (formError) {
        console.error("Form creation error:", formError)
      } else {
        campaign.form = form
      }
    }

    res.json(campaign)
  } catch (error) {
    console.error("Create campaign error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get single campaign
router.get("/:id", async (req, res) => {
  try {
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .select(`
        *,
        qr_codes (*),
        forms (*)
      `)
      .eq("id", req.params.id)
      .eq("user_id", req.user.userId)
      .single()

    if (error || !campaign) {
      return res.status(404).json({ error: "Campaign not found" })
    }

    res.json(campaign)
  } catch (error) {
    console.error("Get campaign error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Update campaign
router.put("/:id", async (req, res) => {
  try {
    const { name, status, config } = req.body

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .update({
        name,
        status,
        config,
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.params.id)
      .eq("user_id", req.user.userId)
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" })
    }

    res.json(campaign)
  } catch (error) {
    console.error("Update campaign error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Delete campaign
router.delete("/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("campaigns").delete().eq("id", req.params.id).eq("user_id", req.user.userId)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ message: "Campaign deleted successfully" })
  } catch (error) {
    console.error("Delete campaign error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export { router as campaignRoutes }

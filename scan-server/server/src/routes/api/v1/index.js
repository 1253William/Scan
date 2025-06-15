import express from "express"
import { authenticateApiKey } from "../../middleware/auth.js"

const router = express.Router()

// Apply API Key authentication to all routes in this module
router.use(authenticateApiKey)

// Example public API endpoint (replace with actual logic)
router.get("/data", async (req, res) => {
  try {
    // Access API key details from req.apiKey
    const apiKeyName = req.apiKey.name
    const apiKeyId = req.apiKey.id

    // Implement your data retrieval logic here
    const data = {
      message: `Hello from the public API!`,
      apiKeyName: apiKeyName,
      apiKeyId: apiKeyId,
    }

    res.json(data)
  } catch (error) {
    console.error("Public API error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export { router as publicApiRoutes }

import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import { supabase } from "../config/database.js"

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({ error: "Access token required" })
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token" })
    }
    req.user = user
    next()
  })
}

export const authenticateApiKey = async (req, res, next) => {
  const apiKey = req.headers["x-api-key"]

  if (!apiKey) {
    return res.status(401).json({ error: "API key required" })
  }

  try {
    // Hash the provided key to compare with stored hash
    const keyHash = await bcrypt.hash(apiKey, 10)

    const { data: apiKeyRecord, error } = await supabase.from("api_keys").select("*").eq("is_active", true).single()

    if (error || !apiKeyRecord) {
      return res.status(401).json({ error: "Invalid API key" })
    }

    // Verify the key hash
    const isValid = await bcrypt.compare(apiKey, apiKeyRecord.key_hash)
    if (!isValid) {
      return res.status(401).json({ error: "Invalid API key" })
    }

    req.apiKey = apiKeyRecord
    next()
  } catch (error) {
    console.error("API key authentication error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

import express from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { supabase } from "../config/database.js"
import { generateApiKey } from "../utils/crypto.js"

const router = express.Router()

// Register
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body

    // Check if user exists
    const { data: existingUser } = await supabase.from("users").select("id").eq("email", email).single()

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Create user
    const { data: user, error } = await supabase
      .from("users")
      .insert([{ email, password_hash: passwordHash, name }])
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    // Generate JWT
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" })

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    })
  } catch (error) {
    console.error("Register error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    // Get user
    const { data: user, error } = await supabase.from("users").select("*").eq("email", email).single()

    if (error || !user) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password_hash)
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    // Generate JWT
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" })

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Generate API Key
router.post("/api-keys", async (req, res) => {
  try {
    const { name, rateLimit = 1000 } = req.body
    const userId = req.user.userId

    const { key, hash } = generateApiKey()

    const { data: apiKey, error } = await supabase
      .from("api_keys")
      .insert([
        {
          user_id: userId,
          key_hash: hash,
          name,
          rate_limit: rateLimit,
        },
      ])
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({
      id: apiKey.id,
      name: apiKey.name,
      key, // Only returned once
      rateLimit: apiKey.rate_limit,
      createdAt: apiKey.created_at,
    })
  } catch (error) {
    console.error("API key generation error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export { router as authRoutes }

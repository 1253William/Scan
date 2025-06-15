import crypto from "crypto"
import bcrypt from "bcryptjs"

export function generateApiKey() {
  const key = "sk_" + crypto.randomBytes(32).toString("hex")
  const hash = bcrypt.hashSync(key, 10)

  return { key, hash }
}

export function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString("hex")
}

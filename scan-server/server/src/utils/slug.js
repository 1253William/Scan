import crypto from "crypto"
import { supabase } from "../config/database.js"

export async function generateSlug(length = 8) {
  let slug
  let isUnique = false

  while (!isUnique) {
    slug = crypto.randomBytes(length).toString("hex").substring(0, length)

    const { data, error } = await supabase.from("qr_codes").select("slug").eq("slug", slug).single()

    if (error && error.code === "PGRST116") {
      // No rows found, slug is unique
      isUnique = true
    }
  }

  return slug
}

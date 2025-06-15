export function errorHandler(err, req, res, next) {
  console.error("Error:", err)

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ error: "Invalid token" })
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ error: "Token expired" })
  }

  // Validation errors
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation error",
      details: err.details,
    })
  }

  // Default error
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  })
}

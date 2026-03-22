const express = require("express")
const cors = require("cors")
const axios = require("axios")
require("dotenv").config()

const app = express()

// ── CORS — allow Vercel + localhost ──────────────────────────────────────────
const allowedOrigins = [
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "https://ai-study-agent-puce.vercel.app",
  "https://ai-study-agent-24a31a04a5s-projects.vercel.app"
]

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }
    // Also allow any vercel.app subdomain for future deployments
    if (origin.endsWith(".vercel.app")) {
      return callback(null, true)
    }
    return callback(new Error("Not allowed by CORS"))
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"]
}))

app.use(express.json())

// ── In-memory conversation store (per user) ──────────────────────────────────
const conversations = {}

const SYSTEM_PROMPT = `You are an expert AI Study Assistant. You help students understand complex academic topics clearly and concisely. 
You explain concepts step-by-step, use simple analogies, and give examples when helpful. 
You cover subjects like Mathematics, Physics, Computer Science, Operating Systems, Algorithms, Machine Learning, and more.
Keep responses focused, educational, and encouraging. If you don't know something, say so honestly.`

// ── Helper: decode JWT payload ───────────────────────────────────────────────
function getUserIdFromToken(authHeader) {
  try {
    if (!authHeader || !authHeader.startsWith("Bearer ")) return "anonymous"
    const token = authHeader.split(" ")[1]
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString())
    return payload.sub || payload.email || "anonymous"
  } catch {
    return "anonymous"
  }
}

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "AI Study Agent server is running ✅" })
})

// ── Clear chat history ────────────────────────────────────────────────────────
app.post("/clear", (req, res) => {
  const userId = getUserIdFromToken(req.headers.authorization)
  conversations[userId] = []
  res.json({ message: "Conversation cleared" })
})

// ── Main chat endpoint ────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { message } = req.body

  if (!message || message.trim() === "") {
    return res.status(400).json({ error: "Message is required" })
  }

  const userId = getUserIdFromToken(req.headers.authorization)

  if (!conversations[userId]) {
    conversations[userId] = []
  }

  conversations[userId].push({
    role: "user",
    content: message.trim()
  })

  // Keep last 20 messages
  if (conversations[userId].length > 20) {
    conversations[userId] = conversations[userId].slice(-20)
  }

  try {
    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...conversations[userId]
        ],
        max_tokens: 1024,
        temperature: 0.7
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    )

    const reply = response.data.choices[0].message.content

    conversations[userId].push({
      role: "assistant",
      content: reply
    })

    return res.json({
      reply,
      model: "llama-3.3-70b-versatile",
      turns: conversations[userId].length
    })

  } catch (error) {

    conversations[userId].pop()

    if (error.response) {
      const status = error.response.status

      if (status === 429) {
        return res.status(429).json({
          reply: "⚠️ Rate limit reached. Please wait a moment and try again.",
          error: "rate_limited"
        })
      }

      if (status === 401) {
        return res.status(401).json({
          reply: "❌ Invalid API key. Please check your GROQ_API_KEY in Render environment variables.",
          error: "invalid_key"
        })
      }

      return res.status(500).json({
        reply: "❌ AI service error. Please try again.",
        error: "api_error"
      })
    }

    if (error.code === "ECONNABORTED") {
      return res.status(504).json({
        reply: "⏱️ Request timed out. Please try again.",
        error: "timeout"
      })
    }

    console.error("Server error:", error.message)
    return res.status(500).json({
      reply: "❌ Something went wrong. Please try again.",
      error: "server_error"
    })
  }
})

// ── Keep alive (prevents Render free tier sleep) ──────────────────────────────
const https = require("https")
setInterval(() => {
  https.get("https://ai-study-agent-hmok.onrender.com", (res) => {
    console.log("Keep-alive ping ✓", res.statusCode)
  }).on("error", () => {
    console.log("Keep-alive ping failed")
  })
}, 14 * 60 * 1000)

app.listen(3000, () => {
  console.log("✅ AI Study Agent server running on http://localhost:3000")
  console.log("🤖 Model: llama-3.3-70b-versatile (Groq)")
  console.log("🧠 Multi-turn memory: enabled")
  console.log("🌐 CORS: enabled for Vercel domains")
})
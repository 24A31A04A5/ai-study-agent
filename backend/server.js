const express = require("express")
const cors = require("cors")
const axios = require("axios")
require("dotenv").config()

const app = express()
app.use(cors())
app.use(express.json())

// ── In-memory conversation store (per user) ──────────────────────────────────
// Key: user email or sub from Auth0 token
// Value: array of { role, content } messages
const conversations = {}

const SYSTEM_PROMPT = `You are an expert AI Study Assistant. You help students understand complex academic topics clearly and concisely. 
You explain concepts step-by-step, use simple analogies, and give examples when helpful. 
You cover subjects like Mathematics, Physics, Computer Science, Operating Systems, Algorithms, Machine Learning, and more.
Keep responses focused, educational, and encouraging. If you don't know something, say so honestly.`

// ── Helper: decode JWT payload (no verification — just to extract user id) ───
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

// ── Clear chat history for a user ────────────────────────────────────────────
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

  // Get user id from token for memory
  const userId = getUserIdFromToken(req.headers.authorization)

  // Initialize conversation history for this user
  if (!conversations[userId]) {
    conversations[userId] = []
  }

  // Add user message to history
  conversations[userId].push({
    role: "user",
    content: message.trim()
  })

  // Keep last 20 messages to avoid token overflow (10 exchanges)
  if (conversations[userId].length > 20) {
    conversations[userId] = conversations[userId].slice(-20)
  }

  try {
    // ── Call Groq API (Llama 3.3 70B — free tier) ──────────────────────────
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
        timeout: 30000 // 30 second timeout
      }
    )

    const reply = response.data.choices[0].message.content

    // Save assistant reply to history
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

    // Remove the user message from history if AI failed
    conversations[userId].pop()

    // Handle specific Groq errors
    if (error.response) {
      const status = error.response.status
      const errData = error.response.data

      if (status === 429) {
        return res.status(429).json({
          reply: "⚠️ Rate limit reached. Please wait a moment and try again.",
          error: "rate_limited"
        })
      }

      if (status === 401) {
        return res.status(401).json({
          reply: "❌ Invalid API key. Please check your GROQ_API_KEY in .env file.",
          error: "invalid_key"
        })
      }

      console.error("Groq API error:", status, errData)
      return res.status(500).json({
        reply: "❌ AI service error. Please try again in a moment.",
        error: "api_error"
      })
    }

    if (error.code === "ECONNABORTED") {
      return res.status(504).json({
        reply: "⏱️ Request timed out. The AI is busy — please try again.",
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

app.listen(3000, () => {
  console.log("✅ AI Study Agent server running on http://localhost:3000")
  console.log("🤖 Model: llama-3.3-70b-versatile (Groq)")
  console.log("🧠 Multi-turn memory: enabled")
})
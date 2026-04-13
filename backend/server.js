require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");

const app = express();
const PORT = process.env.PORT || 3000;
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "AI Study Agent backend is running." });
});

app.post("/chat", async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Missing or invalid message." });
  }

  if (!groq) {
    return res.status(500).json({
      error: "AI provider is not configured. Set GROQ_API_KEY in backend/.env"
    });
  }

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.4,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: "You are an expert study assistant. Give clear, concise, and accurate educational answers."
        },
        { role: "user", content: message }
      ]
    });

    const reply = completion.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return res.status(502).json({ error: "AI provider returned an empty response." });
    }

    return res.json({ reply });
  } catch (error) {
    console.error("Groq chat error:", error?.message || error);
    return res.status(502).json({ error: "Failed to fetch AI response from provider." });
  }
});

app.post("/clear", (req, res) => {
  res.json({ cleared: true });
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

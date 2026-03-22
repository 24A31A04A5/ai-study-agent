let auth0Client = null

async function initAuth() {
  auth0Client = await auth0.createAuth0Client({
    domain: "dev-r08vuzglvar1lrtz.us.auth0.com",
    clientId: "kJhgq4jxMuXfZ2RxXFyT7gJUUDqY1gPd",
    authorizationParams: {
      redirect_uri: window.location.origin + "/index.html"
    }
  })

  const query = window.location.search
  if (query.includes("code=") && query.includes("state=")) {
    await auth0Client.handleRedirectCallback()
    window.history.replaceState({}, document.title, "/index.html")
  }

  updateUI()

  document.getElementById("loginBtn").addEventListener("click", login)
  document.getElementById("logoutBtn").addEventListener("click", logout)
  document.getElementById("sendBtn").addEventListener("click", sendMessage)

  document.getElementById("msg").addEventListener("keypress", function (e) {
    if (e.key === "Enter") sendMessage()
  })

  document.getElementById("msg").focus()
}

async function login() {
  await auth0Client.loginWithRedirect()
}

async function logout() {
  auth0Client.logout({
    logoutParams: {
      returnTo: window.location.origin + "/index.html"
    }
  })
}

async function updateUI() {
  const isAuthenticated = await auth0Client.isAuthenticated()

  if (isAuthenticated) {
    const user = await auth0Client.getUser()
    document.getElementById("user").innerText = "👋 " + user.name
    document.getElementById("loginBtn").style.display = "none"
    document.getElementById("logoutBtn").style.display = "inline"

    if (document.getElementById("chatBox").children.length === 0) {
      addMessage("Hi! I'm your AI Study Assistant powered by Llama 3.3 70B. Ask me anything 📚", "bot")
    }
  } else {
    document.getElementById("user").innerText = "Not logged in"
    document.getElementById("loginBtn").style.display = "inline"
    document.getElementById("logoutBtn").style.display = "none"
  }
}

function addMessage(text, type) {
  const chatBox = document.getElementById("chatBox")
  const msgDiv = document.createElement("div")
  msgDiv.classList.add("message", type)
  msgDiv.innerText = text
  chatBox.appendChild(msgDiv)
  chatBox.scrollTop = chatBox.scrollHeight
}

function typeEffect(text, type) {
  const chatBox = document.getElementById("chatBox")
  const msgDiv = document.createElement("div")
  msgDiv.classList.add("message", type)
  chatBox.appendChild(msgDiv)

  let i = 0
  function typing() {
    if (i < text.length) {
      msgDiv.innerText += text.charAt(i)
      i++
      chatBox.scrollTop = chatBox.scrollHeight
      setTimeout(typing, 12)
    }
  }
  typing()
}

async function clearChat() {
  document.getElementById("chatBox").innerHTML = ""

  try {
    const isAuthenticated = await auth0Client.isAuthenticated()
    if (isAuthenticated) {
      const token = await auth0Client.getTokenSilently()
      await fetch("https://ai-study-agent-hmok.onrender.com/clear", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        }
      })
    }
  } catch (err) {
    console.log("Could not clear server memory:", err)
  }
}

async function sendMessage() {
  const input = document.getElementById("msg")
  const msg = input.value.trim()
  if (msg === "") return

  addMessage(msg, "user")
  input.value = ""

  const loading = document.createElement("div")
  loading.classList.add("message", "bot")
  loading.innerText = "🤖 AI is thinking..."
  document.getElementById("chatBox").appendChild(loading)
  document.getElementById("chatBox").scrollTop = document.getElementById("chatBox").scrollHeight

  try {
    const isAuthenticated = await auth0Client.isAuthenticated()

    if (!isAuthenticated) {
      loading.remove()
      return addMessage("Please login first to use the AI assistant.", "bot")
    }

    const token = await auth0Client.getTokenSilently()

    const res = await fetch("https://ai-study-agent-hmok.onrender.com/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ message: msg })
    })

    const data = await res.json()
    loading.remove()

    if (data.reply) {
      typeEffect(data.reply, "bot")
    } else {
      addMessage("❌ No response from AI. Try again.", "bot")
    }

  } catch (err) {
    console.error(err)
    loading.remove()
    addMessage("❌ Error connecting to server. Please try again.", "bot")
  }
}

initAuth()
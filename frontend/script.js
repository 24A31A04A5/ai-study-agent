let auth0Client = null

async function initAuth(){

auth0Client = await auth0.createAuth0Client({
domain: "dev-r08vuzglvar1lrtz.us.auth0.com",
clientId: "kJhgq4jxMuXfZ2RxXFyT7gJUUDqY1gPd",
authorizationParams:{
redirect_uri: "http://127.0.0.1:5500/frontend/index.html"
}
})

const query = window.location.search

if(query.includes("code=") && query.includes("state=")){
await auth0Client.handleRedirectCallback()
window.history.replaceState({}, document.title, "/frontend/index.html")
}

updateUI()

document.getElementById("loginBtn").addEventListener("click", login)
document.getElementById("logoutBtn").addEventListener("click", logout)
document.getElementById("sendBtn").addEventListener("click", sendMessage)

// Enter key support
document.getElementById("msg").addEventListener("keypress", function(e){
if(e.key === "Enter"){
sendMessage()
}
})

// auto focus
document.getElementById("msg").focus()
}

async function login(){
await auth0Client.loginWithRedirect()
}

async function logout(){
auth0Client.logout({
logoutParams:{
returnTo: "http://127.0.0.1:5500/frontend/index.html"
}
})
}

async function updateUI(){
const isAuthenticated = await auth0Client.isAuthenticated()

if(isAuthenticated){
const user = await auth0Client.getUser()
document.getElementById("user").innerText = "👋 " + user.name
document.getElementById("loginBtn").style.display = "none"
document.getElementById("logoutBtn").style.display = "inline"

// welcome message
if(document.getElementById("chatBox").children.length === 0){
addMessage("Hi! I am your AI Study Assistant. Ask me anything 📚", "bot")
}

}else{
document.getElementById("user").innerText = "Not logged in"
document.getElementById("loginBtn").style.display = "inline"
document.getElementById("logoutBtn").style.display = "none"
}
}

// normal message
function addMessage(text, type){
const chatBox = document.getElementById("chatBox")

const msgDiv = document.createElement("div")
msgDiv.classList.add("message", type)
msgDiv.innerText = text

chatBox.appendChild(msgDiv)
chatBox.scrollTop = chatBox.scrollHeight
}

// typing effect
function typeEffect(text, type){
const chatBox = document.getElementById("chatBox")

const msgDiv = document.createElement("div")
msgDiv.classList.add("message", type)
chatBox.appendChild(msgDiv)

let i = 0

function typing(){
if(i < text.length){
msgDiv.innerText += text.charAt(i)
i++
setTimeout(typing, 15)
}
}

typing()
chatBox.scrollTop = chatBox.scrollHeight
}

// clear chat
function clearChat(){
document.getElementById("chatBox").innerHTML = ""
}

async function sendMessage(){
const input = document.getElementById("msg")
const msg = input.value.trim()

if(msg === "") return

addMessage(msg, "user")
input.value = ""

// loading message
const loading = document.createElement("div")
loading.classList.add("message", "bot")
loading.innerText = "🤖 AI is typing..."
document.getElementById("chatBox").appendChild(loading)

try {

const isAuthenticated = await auth0Client.isAuthenticated()

if (!isAuthenticated){
loading.remove()
return addMessage("Please login first", "bot")
}

const token = await auth0Client.getTokenSilently()

const res = await fetch("http://127.0.0.1:3000/chat", {
method: "POST",
headers: {
"Content-Type": "application/json",
"Authorization": "Bearer " + token
},
body: JSON.stringify({ message: msg })
})

const data = await res.json()

// remove loading
loading.remove()

typeEffect(data.reply, "bot")

} catch (err) {
console.log(err)
loading.remove()
addMessage("Error connecting to server", "bot")
}
}

initAuth()
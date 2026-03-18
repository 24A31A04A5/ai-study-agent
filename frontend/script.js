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

// Enter key support 🔥
document.getElementById("msg").addEventListener("keypress", function(e){
if(e.key === "Enter"){
sendMessage()
}
})
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
}else{
document.getElementById("user").innerText = "Not logged in"
document.getElementById("loginBtn").style.display = "inline"
document.getElementById("logoutBtn").style.display = "none"
}
}

// 🔥 Add messages to chat
function addMessage(text, type){
const chatBox = document.getElementById("chatBox")

const msgDiv = document.createElement("div")
msgDiv.classList.add("message", type)
msgDiv.innerText = text

chatBox.appendChild(msgDiv)

// auto scroll
chatBox.scrollTop = chatBox.scrollHeight
}

async function sendMessage(){
const input = document.getElementById("msg")
const msg = input.value.trim()

if(msg === "") return

addMessage(msg, "user")
input.value = ""

addMessage("Thinking...", "bot")

try {

const isAuthenticated = await auth0Client.isAuthenticated()

if (!isAuthenticated){
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

// remove "Thinking..."
document.getElementById("chatBox").lastChild.remove()

addMessage(data.reply, "bot")

} catch (err) {
console.log(err)
addMessage("Error connecting to server", "bot")
}
}

initAuth()
let auth0Client = null;
let isSending = false;

const STORAGE_KEY = "ai-study-agent-conversations-v1";
const HISTORY_BATCH_SIZE = 20;

const state = {
  conversations: [],
  activeConversationId: null,
  historyVisibleCount: HISTORY_BATCH_SIZE
};

const isLocalHost =
  window.location.protocol === "file:" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "localhost";

const BACKEND_URL = isLocalHost
  ? "http://127.0.0.1:3000"
  : "https://ai-study-agent-hmok.onrender.com";

const LOCAL_REDIRECT_URI = "http://127.0.0.1:5500/frontend/index.html";
const REDIRECT_URI = window.location.protocol === "file:"
  ? LOCAL_REDIRECT_URI
  : window.location.origin + window.location.pathname;

function getEl(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeLinkUrl(urlText) {
  try {
    const normalized = String(urlText).replace(/&amp;/g, "&");
    const parsed = new URL(normalized, window.location.origin);
    const allowed = ["http:", "https:", "mailto:"];
    return allowed.includes(parsed.protocol) ? parsed.href : "";
  } catch (_error) {
    return "";
  }
}

function renderMarkdownSafe(markdownText) {
  if (!markdownText) {
    return "";
  }

  let text = escapeHtml(markdownText).replace(/\r\n?/g, "\n");

  const codeBlocks = [];
  text = text.replace(/```([\s\S]*?)```/g, (_match, code) => {
    const html = `<pre><code>${code.trim()}</code></pre>`;
    const index = codeBlocks.push(html) - 1;
    return `@@CODEBLOCK_${index}@@`;
  });

  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label, href) => {
    const safeHref = sanitizeLinkUrl(href);
    if (!safeHref) {
      return label;
    }
    return `<a href=\"${safeHref}\" target=\"_blank\" rel=\"noopener noreferrer\">${label}</a>`;
  });

  const lines = text.split("\n");
  const blocks = [];
  let inList = false;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList) {
        inList = true;
        blocks.push("<ul>");
      }
      blocks.push(`<li>${trimmed.replace(/^[-*]\s+/, "")}</li>`);
      return;
    }

    if (inList) {
      inList = false;
      blocks.push("</ul>");
    }

    if (trimmed === "") {
      blocks.push("<p></p>");
      return;
    }

    blocks.push(`<p>${line}</p>`);
  });

  if (inList) {
    blocks.push("</ul>");
  }

  let html = blocks.join("");
  html = html.replace(/@@CODEBLOCK_(\d+)@@/g, (_match, indexText) => {
    const index = Number(indexText);
    return codeBlocks[index] || "";
  });

  return html;
}

function setBubbleContent(bubble, role, content) {
  if (role === "user") {
    bubble.textContent = content;
    return;
  }
  bubble.innerHTML = renderMarkdownSafe(content);
}

function isDesktop() {
  return window.matchMedia("(min-width: 1024px)").matches;
}

function closeMobileDrawer() {
  document.body.classList.remove("drawer-open");
}

function setViewMode(mode) {
  const isDashboard = mode === "dashboard";
  const chatBtn = getEl("chatViewBtn");
  const dashboardBtn = getEl("dashboardViewBtn");

  document.body.classList.toggle("dashboard-active", isDashboard);

  if (chatBtn) {
    chatBtn.classList.toggle("active", !isDashboard);
    chatBtn.setAttribute("aria-pressed", String(!isDashboard));
  }

  if (dashboardBtn) {
    dashboardBtn.classList.toggle("active", isDashboard);
    dashboardBtn.setAttribute("aria-pressed", String(isDashboard));
  }

  closeMobileDrawer();
}

function showChatView() {
  setViewMode("chat");
}

function showDashboardView() {
  setViewMode("dashboard");
}

function sendDashboardCommand(payload) {
  const frame = getEl("dashboardFrame");
  const targetWindow = frame?.contentWindow;
  if (!targetWindow) {
    return false;
  }

  targetWindow.postMessage(
    Object.assign({ source: "ai-study-agent" }, payload),
    "*"
  );
  return true;
}

function parseTimerMinutesCommand(message) {
  const patterns = [
    /(?:set|update|change)\s+(?:the\s+)?(?:study\s+)?timer\s+(?:to|for)\s*(\d{1,3})\s*(?:m|min|mins|minute|minutes)\b/i,
    /(?:set|update|change)\s*(\d{1,3})\s*(?:m|min|mins|minute|minutes)\s*(?:study\s*)?timer\b/i,
    /(?:start|begin)\s*(?:a\s*)?(\d{1,3})\s*(?:m|min|mins|minute|minutes)\s*(?:study\s*)?(?:timer|session)\b/i
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const minutes = Number(match[1]);
      if (Number.isFinite(minutes) && minutes >= 1 && minutes <= 180) {
        return minutes;
      }
    }
  }

  return null;
}

function toggleSidebarMode() {
  if (isDesktop()) {
    document.body.classList.toggle("sidebar-collapsed");
  } else {
    document.body.classList.toggle("drawer-open");
  }
}

function createConversation() {
  const now = Date.now();
  return {
    id: "conv-" + now + "-" + Math.random().toString(36).slice(2, 8),
    title: "New chat",
    messages: [],
    createdAt: now,
    updatedAt: now
  };
}

function getSortedConversations() {
  return [...state.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
}

function getActiveConversation() {
  return state.conversations.find((c) => c.id === state.activeConversationId) || null;
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId
      })
    );
  } catch (error) {
    console.warn("Unable to save conversation state", error);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state.conversations = [createConversation()];
      state.activeConversationId = state.conversations[0].id;
      return;
    }

    const parsed = JSON.parse(raw);
    const conversations = Array.isArray(parsed.conversations) ? parsed.conversations : [];
    if (conversations.length === 0) {
      state.conversations = [createConversation()];
      state.activeConversationId = state.conversations[0].id;
      return;
    }

    state.conversations = conversations.map((conv) => ({
      id: conv.id,
      title: typeof conv.title === "string" ? conv.title : "New chat",
      messages: Array.isArray(conv.messages) ? conv.messages : [],
      createdAt: Number(conv.createdAt) || Date.now(),
      updatedAt: Number(conv.updatedAt) || Date.now()
    }));

    const hasActive = state.conversations.some((c) => c.id === parsed.activeConversationId);
    state.activeConversationId = hasActive ? parsed.activeConversationId : state.conversations[0].id;
  } catch (error) {
    console.warn("Unable to load conversation state", error);
    state.conversations = [createConversation()];
    state.activeConversationId = state.conversations[0].id;
  }
}

function updateEmptyState() {
  const emptyState = getEl("emptyState");
  if (!emptyState) {
    return;
  }
  const active = getActiveConversation();
  const hasMessages = !!active && active.messages.length > 0;
  emptyState.style.display = hasMessages ? "none" : "block";
}

function formatHistoryTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function renderHistoryList() {
  const historyList = getEl("historyList");
  if (!historyList) {
    return;
  }

  const sorted = getSortedConversations();
  const visibleItems = sorted.slice(0, state.historyVisibleCount);
  historyList.innerHTML = "";

  const fragment = document.createDocumentFragment();
  visibleItems.forEach((conv) => {
    const li = document.createElement("li");
    const entry = document.createElement("div");
    entry.className = "history-entry";

    const btn = document.createElement("button");
    btn.className = "history-item" + (conv.id === state.activeConversationId ? " active" : "");
    btn.type = "button";
    btn.dataset.id = conv.id;
    btn.innerHTML =
      "<span class=\"history-title\"></span>" +
      "<span class=\"history-time\"></span>";

    btn.querySelector(".history-title").textContent = conv.title;
    btn.querySelector(".history-time").textContent = formatHistoryTime(conv.updatedAt);

    btn.addEventListener("click", () => {
      state.activeConversationId = conv.id;
      saveState();
      renderHistoryList();
      renderActiveConversation();
      closeMobileDrawer();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "history-delete-btn";
    deleteBtn.type = "button";
    deleteBtn.setAttribute("aria-label", "Delete chat");
    deleteBtn.title = "Delete chat";
    deleteBtn.textContent = "×";
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteConversationById(conv.id);
    });

    entry.appendChild(btn);
    entry.appendChild(deleteBtn);
    li.appendChild(entry);
    fragment.appendChild(li);
  });

  historyList.appendChild(fragment);
}

function deleteConversationById(conversationId) {
  const index = state.conversations.findIndex((conversation) => conversation.id === conversationId);
  if (index === -1) {
    return;
  }

  state.conversations.splice(index, 1);

  if (state.conversations.length === 0) {
    const freshConversation = createConversation();
    state.conversations = [freshConversation];
    state.activeConversationId = freshConversation.id;
  } else if (state.activeConversationId === conversationId) {
    const sorted = getSortedConversations();
    state.activeConversationId = sorted[0].id;
  }

  saveState();
  renderHistoryList();
  renderActiveConversation();
}

function renderMessageRow(role, content) {
  const row = document.createElement("div");
  row.className = "message-row " + (role === "user" ? "user" : "bot");

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  setBubbleContent(bubble, role, content);

  row.appendChild(bubble);
  return { row, bubble };
}

function scrollChatToBottom(force = false) {
  const chatScroll = getEl("chatScroll");
  if (!chatScroll) {
    return;
  }

  if (force) {
    chatScroll.scrollTop = chatScroll.scrollHeight;
    return;
  }

  const distanceFromBottom = chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight;
  const nearBottom = distanceFromBottom < 200;
  if (nearBottom) {
    chatScroll.scrollTop = chatScroll.scrollHeight;
  }
}

function renderActiveConversation() {
  const chatBox = getEl("chatBox");
  if (!chatBox) {
    return;
  }

  const active = getActiveConversation();
  chatBox.innerHTML = "";
  if (!active) {
    updateEmptyState();
    return;
  }

  const fragment = document.createDocumentFragment();
  active.messages.forEach((msg) => {
    fragment.appendChild(renderMessageRow(msg.role, msg.content).row);
  });

  chatBox.appendChild(fragment);
  updateEmptyState();
  scrollChatToBottom(true);
}

function updateConversationTitle(conversation, messageText) {
  if (!conversation || conversation.title !== "New chat") {
    return;
  }
  const normalized = messageText.replace(/\s+/g, " ").trim();
  conversation.title = normalized.slice(0, 42) || "New chat";
}

function appendMessageToState(role, content) {
  const conversation = getActiveConversation();
  if (!conversation) {
    return null;
  }

  conversation.messages.push({ role, content, timestamp: Date.now() });
  conversation.updatedAt = Date.now();

  if (role === "user") {
    updateConversationTitle(conversation, content);
  }

  saveState();
  return conversation;
}

function appendMessageToDOM(role, content) {
  const chatBox = getEl("chatBox");
  if (!chatBox) {
    return null;
  }

  const { row, bubble } = renderMessageRow(role, content);
  chatBox.appendChild(row);
  updateEmptyState();
  scrollChatToBottom();
  return { row, bubble };
}

function setComposerBusy(busy) {
  const sendBtn = getEl("sendBtn");
  const textarea = getEl("msg");
  if (sendBtn) {
    sendBtn.disabled = busy;
  }
  if (textarea) {
    textarea.disabled = busy;
  }
}

function autoResizeTextarea() {
  const textarea = getEl("msg");
  if (!textarea) {
    return;
  }
  textarea.style.height = "auto";
  const nextHeight = Math.min(textarea.scrollHeight, 180);
  textarea.style.height = nextHeight + "px";
}

async function typeEffect(content) {
  const chatBox = getEl("chatBox");
  if (!chatBox) {
    return;
  }

  const { row, bubble } = renderMessageRow("bot", "");
  chatBox.appendChild(row);
  updateEmptyState();

  let index = 0;
  await new Promise((resolve) => {
    function step() {
      if (index >= content.length) {
        resolve();
        return;
      }

      bubble.textContent += content.charAt(index);
      index += 1;
      scrollChatToBottom();
      setTimeout(step, 11);
    }
    step();
  });

  setBubbleContent(bubble, "bot", content);
}

function showTypingIndicator() {
  const chatBox = getEl("chatBox");
  if (!chatBox) {
    return null;
  }

  const row = document.createElement("div");
  row.className = "message-row bot";
  row.id = "typingIndicator";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = "<div class=\"typing-dots\"><span></span><span></span><span></span></div>";
  row.appendChild(bubble);

  chatBox.appendChild(row);
  updateEmptyState();
  scrollChatToBottom();
  return row;
}

function bindSuggestionChips() {
  document.querySelectorAll(".suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const suggestion = chip.getAttribute("data-suggestion");
      const textarea = getEl("msg");
      if (textarea && suggestion) {
        textarea.value = suggestion;
        autoResizeTextarea();
        textarea.focus();
      }
    });
  });
}

async function clearBackendMemoryIfAuthenticated() {
  try {
    const isAuthenticated = await auth0Client.isAuthenticated();
    if (!isAuthenticated) {
      return;
    }

    const token = await auth0Client.getTokenSilently();
    await fetch(`${BACKEND_URL}/clear`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      }
    });
  } catch (error) {
    console.warn("Failed to clear backend memory", error);
  }
}

function createAndOpenNewChat() {
  const next = createConversation();
  state.conversations.unshift(next);
  state.activeConversationId = next.id;
  state.historyVisibleCount = Math.max(HISTORY_BATCH_SIZE, state.historyVisibleCount);
  saveState();
  renderHistoryList();
  renderActiveConversation();
}

async function handleNewChat() {
  createAndOpenNewChat();
  closeMobileDrawer();
  await clearBackendMemoryIfAuthenticated();
}

async function handleClearActiveConversation() {
  const active = getActiveConversation();
  if (!active) {
    return;
  }

  active.messages = [];
  active.title = "New chat";
  active.updatedAt = Date.now();
  saveState();
  renderHistoryList();
  renderActiveConversation();
  await clearBackendMemoryIfAuthenticated();
}

async function initAuth() {
  auth0Client = await auth0.createAuth0Client({
    domain: "dev-r08vuzglvar1lrtz.us.auth0.com",
    clientId: "kJhgq4jxMuXfZ2RxXFyT7gJUUDqY1gPd",
    authorizationParams: {
      redirect_uri: REDIRECT_URI
    }
  });

  const query = window.location.search;
  if (query.includes("code=") && query.includes("state=")) {
    await auth0Client.handleRedirectCallback();
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  await updateUI();
}

async function updateUI() {
  const userStatus = getEl("user");
  const loginBtn = getEl("loginBtn");
  const logoutBtn = getEl("logoutBtn");

  const isAuthenticated = await auth0Client.isAuthenticated();
  if (isAuthenticated) {
    const user = await auth0Client.getUser();
    const displayName = user?.name || user?.email || "User";
    if (userStatus) {
      userStatus.textContent = "Signed in as " + displayName;
    }
    if (loginBtn) {
      loginBtn.style.display = "none";
    }
    if (logoutBtn) {
      logoutBtn.style.display = "inline-block";
    }
  } else {
    if (userStatus) {
      userStatus.textContent = "Not signed in";
    }
    if (loginBtn) {
      loginBtn.style.display = "inline-block";
    }
    if (logoutBtn) {
      logoutBtn.style.display = "none";
    }
  }
}

async function login() {
  await auth0Client.loginWithRedirect();
}

async function logout() {
  auth0Client.logout({
    logoutParams: {
      returnTo: REDIRECT_URI
    }
  });
}

async function sendMessage() {
  if (isSending) {
    return;
  }

  const textarea = getEl("msg");
  if (!textarea) {
    return;
  }

  const message = textarea.value.trim();
  if (!message) {
    return;
  }

  isSending = true;
  setComposerBusy(true);

  appendMessageToState("user", message);
  appendMessageToDOM("user", message);
  renderHistoryList();

  const timerMinutes = parseTimerMinutesCommand(message);
  if (timerMinutes) {
    const commandSent = sendDashboardCommand({
      type: "dashboard:set-timer",
      minutes: timerMinutes,
      autoStart: true
    });

    const timerReply = commandSent
      ? `Done. I set the dashboard study timer to ${timerMinutes} minutes and started it.`
      : `I understood your timer command (${timerMinutes} minutes), but the dashboard is not available right now.`;

    appendMessageToState("assistant", timerReply);
    appendMessageToDOM("bot", timerReply);
    renderHistoryList();
    showDashboardView();

    textarea.value = "";
    autoResizeTextarea();
    isSending = false;
    setComposerBusy(false);
    textarea.focus();
    return;
  }

  textarea.value = "";
  autoResizeTextarea();

  const typingRow = showTypingIndicator();

  try {
    const isAuthenticated = await auth0Client.isAuthenticated();
    if (!isAuthenticated) {
      typingRow?.remove();
      const notice = "Please sign in first to use the AI assistant.";
      appendMessageToState("assistant", notice);
      appendMessageToDOM("bot", notice);
      renderHistoryList();
      return;
    }

    const token = await auth0Client.getTokenSilently();
    const response = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ message })
    });

    const data = await response.json();
    typingRow?.remove();

    if (!response.ok) {
      const errorText = data.error || "The AI request failed. Please try again.";
      appendMessageToState("assistant", errorText);
      appendMessageToDOM("bot", errorText);
      renderHistoryList();
      return;
    }

    const reply = data.reply || "No response was returned. Please try again.";
    appendMessageToState("assistant", reply);
    await typeEffect(reply);
    renderHistoryList();
  } catch (error) {
    typingRow?.remove();
    console.error(error);
    const errText = "Error connecting to the server. Please try again.";
    appendMessageToState("assistant", errText);
    appendMessageToDOM("bot", errText);
    renderHistoryList();
  } finally {
    isSending = false;
    setComposerBusy(false);
    textarea.focus();
  }
}

function bindEvents() {
  getEl("menuBtn")?.addEventListener("click", toggleSidebarMode);
  getEl("collapseBtn")?.addEventListener("click", toggleSidebarMode);
  getEl("drawerBackdrop")?.addEventListener("click", closeMobileDrawer);
  getEl("chatViewBtn")?.addEventListener("click", showChatView);
  getEl("dashboardViewBtn")?.addEventListener("click", showDashboardView);

  getEl("newChatBtn")?.addEventListener("click", handleNewChat);
  getEl("clearBtn")?.addEventListener("click", handleClearActiveConversation);
  getEl("historyPanel")?.addEventListener("scroll", (event) => {
    const panel = event.currentTarget;
    if (!panel) {
      return;
    }

    const hasMore = state.historyVisibleCount < state.conversations.length;
    if (!hasMore) {
      return;
    }

    const threshold = 96;
    const nearBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - threshold;
    if (nearBottom) {
      state.historyVisibleCount = Math.min(
        state.historyVisibleCount + HISTORY_BATCH_SIZE,
        state.conversations.length
      );
      renderHistoryList();
    }
  });

  getEl("loginBtn")?.addEventListener("click", login);
  getEl("logoutBtn")?.addEventListener("click", logout);

  getEl("sendBtn")?.addEventListener("click", sendMessage);

  const textarea = getEl("msg");
  textarea?.addEventListener("input", autoResizeTextarea);
  textarea?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  window.addEventListener("resize", () => {
    if (isDesktop()) {
      closeMobileDrawer();
    }
  });

  bindSuggestionChips();
}

async function initApp() {
  loadState();
  bindEvents();
  setViewMode("chat");
  renderHistoryList();
  renderActiveConversation();
  autoResizeTextarea();
  getEl("msg")?.focus();
  await initAuth();
}

document.addEventListener("DOMContentLoaded", initApp);
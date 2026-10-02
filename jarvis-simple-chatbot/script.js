// Jarvis: a simple AI chatbot using the Google Gemini API.

// ---------- 1. Settings ----------
// The app tries these models in order. If one is busy, it tries the next.
const MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/";

// Friendly messages (users never see raw API errors)
const ERROR_MESSAGES = {
  no_key: "Please click \"API Key\" at the top and paste your Gemini key.",
  bad_key: "Your API key was not accepted. Please check it and try again.",
  network: "Could not connect to Gemini. Check your internet and try again.",
  busy: "Gemini is busy right now. Please wait a minute and send your message again.",
  empty: "Gemini could not answer that. Try asking in a different way.",
};

// ---------- 2. Page elements ----------
const messagesBox = document.getElementById("messages");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const keyBox = document.getElementById("keyBox");
const keyInput = document.getElementById("keyInput");
const keyMessage = document.getElementById("keyMessage");

// ---------- 3. Chat memory ----------
// Each item looks like: { role: "user" or "model", text: "..." }
let chat = loadChat();

function loadChat() {
  try {
    return JSON.parse(localStorage.getItem("jarvis_chat")) || [];
  } catch (error) {
    return [];
  }
}

function saveChat() {
  localStorage.setItem("jarvis_chat", JSON.stringify(chat));
}

// ---------- 4. Showing messages ----------
// Makes AI text look nice: **bold**, `code` and code blocks.
// We replace < and > FIRST so AI text can never inject HTML.
function formatText(text) {
  let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/\n?```\w*\n?([\s\S]*?)```\n?/g, "<pre><code>$1</code></pre>");
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/^#{1,6} (.*)$/gm, "<strong>$1</strong>");
  html = html.replace(/^[*-] /gm, "• ");
  html = html.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

function showMessage(role, text, isError = false) {
  const div = document.createElement("div");
  div.className = "message " + (role === "user" ? "user" : "bot");
  if (isError) div.classList.add("error");

  if (role === "user" || isError) {
    div.textContent = text;            // plain text is always safe
  } else {
    div.innerHTML = formatText(text);  // AI text (escaped first)
  }

  messagesBox.appendChild(div);
  messagesBox.scrollTop = messagesBox.scrollHeight;
  return div;
}

function showTyping() {
  const div = document.createElement("div");
  div.className = "message bot typing";
  div.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  messagesBox.appendChild(div);
  messagesBox.scrollTop = messagesBox.scrollHeight;
  return div;
}

function showWelcome() {
  showMessage("model", "Hi! I'm Jarvis. Ask me anything, for example: \"Explain Java HashMap\".");
}

// ---------- 5. Talking to Gemini ----------
async function askGemini() {
  const apiKey = localStorage.getItem("jarvis_api_key");
  if (!apiKey) throw new Error("no_key");

  // The request: the conversation so far (last 20 messages) + instructions
  const body = {
    systemInstruction: {
      parts: [{ text: "You are Jarvis, a friendly AI assistant. Give clear, simple answers." }],
    },
    contents: chat.slice(-20).map(function (m) {
      return { role: m.role, parts: [{ text: m.text }] };
    }),
  };

  // Try each model until one works
  for (const model of MODELS) {
    let response;
    try {
      response = await fetch(API_URL + model + ":generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),   // give up after 30 seconds
      });
    } catch (error) {
      throw new Error("network");
    }

    if (response.ok) {
      const data = await response.json();
      // The answer is inside: data.candidates[0].content.parts[0].text
      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts.map(function (p) { return p.text || ""; }).join("");
      if (!text) throw new Error("empty");
      return text;
    }

    console.error("Gemini error", response.status, "from", model);   // technical details: console only
    if ([400, 401, 403].includes(response.status)) throw new Error("bad_key");
    // 404 (old model), 429 (limit) or 5xx (busy): try the next model
  }

  throw new Error("busy");
}

// ---------- 6. Sending a message ----------
async function sendMessage(text) {
  chat.push({ role: "user", text: text });
  showMessage("user", text);
  saveChat();

  userInput.disabled = true;
  sendBtn.disabled = true;
  const typing = showTyping();

  try {
    const reply = await askGemini();
    typing.remove();
    chat.push({ role: "model", text: reply });
    saveChat();
    showMessage("model", reply);
  } catch (error) {
    typing.remove();
    chat.pop();      // forget the failed question so the chat stays in order
    saveChat();
    showMessage("model", ERROR_MESSAGES[error.message] || "Something went wrong. Please try again.", true);
    if (error.message === "no_key" || error.message === "bad_key") keyBox.hidden = false;
  }

  userInput.disabled = false;
  sendBtn.disabled = false;
  userInput.focus();
}

// ---------- 7. Buttons and events ----------
chatForm.addEventListener("submit", function (event) {
  event.preventDefault();                 // stop the page from reloading
  const text = userInput.value.trim();
  if (text === "") return;                // ignore empty messages
  userInput.value = "";
  sendMessage(text);
});

document.getElementById("newChatBtn").addEventListener("click", function () {
  chat = [];
  saveChat();
  messagesBox.innerHTML = "";
  showWelcome();
  userInput.focus();
});

document.getElementById("keyBtn").addEventListener("click", function () {
  keyBox.hidden = !keyBox.hidden;
  if (!keyBox.hidden) keyInput.focus();
});

document.getElementById("saveKeyBtn").addEventListener("click", function () {
  const key = keyInput.value.trim();
  if (key.length < 20 || key.includes(" ")) {
    keyMessage.textContent = "That does not look like a full key. Copy it again.";
    return;
  }
  localStorage.setItem("jarvis_api_key", key);
  keyInput.value = "";
  keyMessage.textContent = "Saved! You can start chatting.";
  setTimeout(function () { keyBox.hidden = true; }, 900);
});

// ---------- 8. Start the app ----------
if (chat.length === 0) {
  showWelcome();
} else {
  chat.forEach(function (m) { showMessage(m.role, m.text); });
}
if (!localStorage.getItem("jarvis_api_key")) keyBox.hidden = false;
userInput.focus();

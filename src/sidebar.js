import { marked } from "marked";

// Configure marked options
marked.use({
  gfm: true,
  breaks: true,
});

// DOM Elements
const chatTimeline = document.getElementById("chatTimeline");
const emptyState = document.getElementById("emptyState");
const chatInput = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");
const summarizeButton = document.getElementById("summarizeButton");
const newChatButton = document.getElementById("newChatButton");
const settingsButton = document.getElementById("settingsButton");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");
const cancelSettings = document.getElementById("cancelSettings");
const saveSettings = document.getElementById("saveSettings");
const apiKeyInput = document.getElementById("apiKey");
const apiProviderSelect = document.getElementById("apiProvider");
const customUrlGroup = document.getElementById("customUrlGroup");
const customApiUrlInput = document.getElementById("customApiUrl");
const modelSelect = document.getElementById("modelSelect");
const fetchModelsButton = document.getElementById("fetchModelsButton");
const modelHint = document.getElementById("modelHint");
const systemPromptInput = document.getElementById("systemPrompt");

// API Provider URL mapping
const API_PROVIDERS = {
  anthropic: "https://api.anthropic.com",
  zai: "https://api.z.ai/api/anthropic",
  custom: null,
};

// State
let messages = [];
let isLoading = false;
let settings = {
  apiKey: "",
  apiProvider: "anthropic",
  customApiUrl: "",
  model: "",
  systemPrompt: "",
};

// Cache for fetched models
let cachedModels = [];

// Get the actual API base URL based on provider
function getApiBaseUrl() {
  if (settings.apiProvider === "custom") {
    return settings.customApiUrl || "https://api.anthropic.com";
  }
  return API_PROVIDERS[settings.apiProvider] || API_PROVIDERS.anthropic;
}

// Update custom URL field visibility
function updateCustomUrlVisibility() {
  if (apiProviderSelect.value === "custom") {
    customUrlGroup.style.display = "block";
  } else {
    customUrlGroup.style.display = "none";
  }
}

// Get temporary API base URL from form inputs (before saving)
function getFormApiBaseUrl() {
  const provider = apiProviderSelect.value;
  if (provider === "custom") {
    return customApiUrlInput.value.trim() || "https://api.anthropic.com";
  }
  return API_PROVIDERS[provider] || API_PROVIDERS.anthropic;
}

// Fetch available models from API
async function fetchModels() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    modelHint.textContent = "API Keyを入力してください";
    modelHint.className = "form-hint error";
    return;
  }

  const baseUrl = getFormApiBaseUrl();

  // Update UI state
  fetchModelsButton.disabled = true;
  fetchModelsButton.textContent = "取得中...";
  modelHint.textContent = "モデル一覧を取得中...";
  modelHint.className = "form-hint";

  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    cachedModels = data.data || [];

    // Update model select dropdown
    modelSelect.innerHTML = "";

    if (cachedModels.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "モデルが見つかりません";
      modelSelect.appendChild(option);
      modelSelect.disabled = true;
    } else {
      cachedModels.forEach((model) => {
        const option = document.createElement("option");
        option.value = model.id;
        option.textContent = model.display_name || model.id;
        modelSelect.appendChild(option);
      });
      modelSelect.disabled = false;

      // Restore previously selected model if available
      if (settings.model && cachedModels.some((m) => m.id === settings.model)) {
        modelSelect.value = settings.model;
      }
    }

    modelHint.textContent = `${cachedModels.length}個のモデルを取得しました`;
    modelHint.className = "form-hint success";
  } catch (error) {
    modelHint.textContent = `エラー: ${error.message}`;
    modelHint.className = "form-hint error";
    modelSelect.innerHTML = '<option value="">モデルを取得してください</option>';
    modelSelect.disabled = true;
  } finally {
    fetchModelsButton.disabled = false;
    fetchModelsButton.textContent = "取得";
  }
}

// Initialize
async function init() {
  await loadSettings();
  setupEventListeners();
  adjustTextareaHeight();
}

// Load settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(["apiKey", "apiProvider", "customApiUrl", "model", "systemPrompt"]);
    if (result.apiKey) {
      settings.apiKey = result.apiKey;
      apiKeyInput.value = result.apiKey;
    }
    if (result.apiProvider) {
      settings.apiProvider = result.apiProvider;
      apiProviderSelect.value = result.apiProvider;
      updateCustomUrlVisibility();
    }
    if (result.customApiUrl) {
      settings.customApiUrl = result.customApiUrl;
      customApiUrlInput.value = result.customApiUrl;
    }
    if (result.model) {
      settings.model = result.model;
    }
    if (result.systemPrompt) {
      settings.systemPrompt = result.systemPrompt;
      systemPromptInput.value = result.systemPrompt;
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
}

// Save settings to storage
async function saveSettingsToStorage() {
  try {
    await chrome.storage.local.set({
      apiKey: settings.apiKey,
      apiProvider: settings.apiProvider,
      customApiUrl: settings.customApiUrl,
      model: settings.model,
      systemPrompt: settings.systemPrompt,
    });
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Chat input
  chatInput.addEventListener("input", () => {
    adjustTextareaHeight();
    updateSendButtonState();
  });

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Send button
  sendButton.addEventListener("click", sendMessage);

  // Summarize button
  summarizeButton.addEventListener("click", summarizePage);

  // New chat button
  newChatButton.addEventListener("click", startNewChat);

  // Settings modal
  settingsButton.addEventListener("click", openSettings);
  closeSettings.addEventListener("click", closeSettingsModal);
  cancelSettings.addEventListener("click", closeSettingsModal);
  saveSettings.addEventListener("click", handleSaveSettings);

  // API provider dropdown
  apiProviderSelect.addEventListener("change", updateCustomUrlVisibility);

  // Fetch models button
  fetchModelsButton.addEventListener("click", fetchModels);

  // Close modal on overlay click
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });
}

// Adjust textarea height
function adjustTextareaHeight() {
  const minHeight = 21;
  const maxHeight = 120;

  // 入力が空の場合はmin-heightで固定
  if (!chatInput.value) {
    chatInput.style.height = minHeight + "px";
    return;
  }

  chatInput.style.height = "auto";
  const newHeight = Math.max(minHeight, Math.min(chatInput.scrollHeight, maxHeight));
  chatInput.style.height = newHeight + "px";
}

// Update send button state
function updateSendButtonState() {
  sendButton.disabled = !chatInput.value.trim() || isLoading;
}

// Open settings modal
function openSettings() {
  apiKeyInput.value = settings.apiKey;
  apiProviderSelect.value = settings.apiProvider;
  customApiUrlInput.value = settings.customApiUrl;
  systemPromptInput.value = settings.systemPrompt;
  updateCustomUrlVisibility();

  // Reset model select if no cached models
  if (cachedModels.length === 0 && settings.model) {
    // Show saved model as placeholder
    modelSelect.innerHTML = `<option value="${settings.model}">${settings.model}</option>`;
    modelSelect.value = settings.model;
    modelSelect.disabled = true;
    modelHint.textContent = "「取得」ボタンでモデル一覧を更新してください";
    modelHint.className = "form-hint";
  } else if (cachedModels.length > 0) {
    modelSelect.value = settings.model;
  }

  settingsModal.classList.add("open");
}

// Close settings modal
function closeSettingsModal() {
  settingsModal.classList.remove("open");
}

// Handle save settings
function handleSaveSettings() {
  settings.apiKey = apiKeyInput.value.trim();
  settings.apiProvider = apiProviderSelect.value;
  settings.customApiUrl = customApiUrlInput.value.trim();
  settings.model = modelSelect.value || settings.model;
  settings.systemPrompt = systemPromptInput.value.trim();
  saveSettingsToStorage();
  closeSettingsModal();
}

// Render markdown to HTML
function renderMarkdown(content) {
  return marked.parse(content);
}

// Add message to UI
function addMessageToUI(role, content, isStreaming = false) {
  // Hide empty state
  if (emptyState) {
    emptyState.style.display = "none";
  }

  const messageDiv = document.createElement("div");
  messageDiv.className = `message message-${role}`;
  if (isStreaming) {
    messageDiv.id = "streamingMessage";
  }

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";

  if (role === "assistant") {
    contentDiv.innerHTML = renderMarkdown(content);
  } else {
    contentDiv.textContent = content;
  }

  messageDiv.appendChild(contentDiv);
  chatTimeline.appendChild(messageDiv);
  scrollToBottom();

  return contentDiv;
}

// Update streaming message
function updateStreamingMessage(content) {
  const streamingMessage = document.getElementById("streamingMessage");
  if (streamingMessage) {
    const contentDiv = streamingMessage.querySelector(".message-content");
    if (contentDiv) {
      contentDiv.innerHTML = renderMarkdown(content);
      scrollToBottom();
    }
  }
}

// Finalize streaming message
function finalizeStreamingMessage() {
  const streamingMessage = document.getElementById("streamingMessage");
  if (streamingMessage) {
    streamingMessage.removeAttribute("id");
  }
}

// Add loading indicator
function addLoadingIndicator() {
  const loadingDiv = document.createElement("div");
  loadingDiv.className = "message message-assistant";
  loadingDiv.id = "loadingIndicator";

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content typing-indicator";
  contentDiv.innerHTML = "<span></span><span></span><span></span>";

  loadingDiv.appendChild(contentDiv);
  chatTimeline.appendChild(loadingDiv);
  scrollToBottom();
}

// Remove loading indicator
function removeLoadingIndicator() {
  const loadingIndicator = document.getElementById("loadingIndicator");
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
}

// Show error message
function showError(message) {
  const existingError = chatTimeline.querySelector(".error-message");
  if (existingError) {
    existingError.remove();
  }

  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.textContent = message;
  chatTimeline.appendChild(errorDiv);
  scrollToBottom();
}

// Scroll to bottom
function scrollToBottom() {
  chatTimeline.scrollTop = chatTimeline.scrollHeight;
}

// Start new chat
function startNewChat() {
  // Clear messages array
  messages = [];

  // Clear chat timeline UI
  chatTimeline.innerHTML = "";

  // Show empty state
  const emptyStateDiv = document.createElement("div");
  emptyStateDiv.className = "empty-state";
  emptyStateDiv.id = "emptyState";
  emptyStateDiv.innerHTML = "<p>お手伝いできることはありますか？</p>";
  chatTimeline.appendChild(emptyStateDiv);

  // Clear input
  chatInput.value = "";
  adjustTextareaHeight();
  updateSendButtonState();
}

// Send message
async function sendMessage() {
  const content = chatInput.value.trim();
  if (!content || isLoading) return;

  if (!settings.apiKey) {
    showError("API Keyが設定されていません。設定ボタンから設定してください。");
    return;
  }

  // Add user message
  messages.push({ role: "user", content });
  addMessageToUI("user", content);

  // Clear input
  chatInput.value = "";
  adjustTextareaHeight();
  updateSendButtonState();

  // Send to API
  await sendToAPIStreaming();
}

// Summarize page
async function summarizePage() {
  if (isLoading) return;

  if (!settings.apiKey) {
    showError("API Keyが設定されていません。設定ボタンから設定してください。");
    return;
  }

  // Get page content from parent window
  try {
    const pageContent = await getPageContent();
    if (!pageContent) {
      showError("ページコンテンツを取得できませんでした。");
      return;
    }

    const summaryPrompt = `以下のWebページの内容を日本語で簡潔に要約してください：\n\n${pageContent}`;

    // Add user message
    messages.push({ role: "user", content: "ページを要約" });
    addMessageToUI("user", "ページを要約");

    // Add the actual content as a system-like context (hidden from UI but sent to API)
    const messagesWithContext = [
      ...messages.slice(0, -1),
      { role: "user", content: summaryPrompt },
    ];

    // Send to API with context
    await sendToAPIStreaming(messagesWithContext);
  } catch (error) {
    showError("ページコンテンツの取得に失敗しました: " + error.message);
  }
}

// Get page content from parent window
async function getPageContent() {
  return new Promise((resolve) => {
    // Send message to content script
    window.parent.postMessage({ type: "GET_PAGE_CONTENT" }, "*");

    // Listen for response
    const handler = (event) => {
      if (event.data && event.data.type === "PAGE_CONTENT") {
        window.removeEventListener("message", handler);
        resolve(event.data.content);
      }
    };

    window.addEventListener("message", handler);

    // Timeout after 5 seconds
    setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
    }, 5000);
  });
}

// Send to Anthropic API with streaming
async function sendToAPIStreaming(customMessages = null) {
  isLoading = true;
  updateSendButtonState();
  summarizeButton.disabled = true;
  addLoadingIndicator();

  try {
    const messagesToSend = customMessages || messages;

    const requestBody = {
      model: settings.model || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      stream: true,
      messages: messagesToSend,
    };

    // Add system prompt if configured
    if (settings.systemPrompt) {
      requestBody.system = settings.systemPrompt;
    }

    const response = await fetch(`${getApiBaseUrl()}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `API error: ${response.status}`
      );
    }

    // Remove loading indicator and start streaming
    removeLoadingIndicator();

    // Create streaming message
    let fullContent = "";
    addMessageToUI("assistant", "", true);

    // Process SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);

            if (event.type === "content_block_delta") {
              const delta = event.delta;
              if (delta && delta.type === "text_delta" && delta.text) {
                fullContent += delta.text;
                updateStreamingMessage(fullContent);
              }
            } else if (event.type === "message_stop") {
              // Stream complete
              finalizeStreamingMessage();
            } else if (event.type === "error") {
              throw new Error(event.error?.message || "Stream error");
            }
          } catch (parseError) {
            // Ignore JSON parse errors for non-JSON lines
            if (data.trim() && !data.startsWith("event:")) {
              console.warn("Failed to parse SSE data:", data);
            }
          }
        }
      }
    }

    // Add assistant message to history
    if (fullContent) {
      messages.push({ role: "assistant", content: fullContent });
    }
  } catch (error) {
    removeLoadingIndicator();
    // Remove streaming message if it exists
    const streamingMessage = document.getElementById("streamingMessage");
    if (streamingMessage) {
      streamingMessage.remove();
    }
    showError(`エラー: ${error.message}`);
  } finally {
    isLoading = false;
    updateSendButtonState();
    summarizeButton.disabled = false;
  }
}

// Start the app
init();

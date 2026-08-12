import { marked } from "marked";
import OpenAI from "openai";
import { createElement, createIcons, Brain, ChevronDown, ChevronRight, Plus, Search, Send, Settings, X } from "lucide";

// Configure marked options
marked.use({
  gfm: true,
  breaks: true,
});

// Replace Lucide icons
createIcons({
  icons: {
    ChevronDown,
    Plus,
    Send,
    Settings,
    X,
  },
});

// DOM Elements
const chatTimeline = document.getElementById("chatTimeline");
const chatInput = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");
const summarizeButton = document.getElementById("summarizeButton");
const newChatButton = document.getElementById("newChatButton");
const settingsButton = document.getElementById("settingsButton");
const closeSidebarButton = document.getElementById("closeSidebarButton");
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");
const cancelSettings = document.getElementById("cancelSettings");
const saveSettings = document.getElementById("saveSettings");
const apiKeyInput = document.getElementById("apiKey");
const apiProviderSelect = document.getElementById("apiProvider");
const customUrlGroup = document.getElementById("customUrlGroup");
const customApiUrlInput = document.getElementById("customApiUrl");
const tavilyApiKeyInput = document.getElementById("tavilyApiKey");
const modelSelect = document.getElementById("modelSelect");
const fetchModelsButton = document.getElementById("fetchModelsButton");
const modelHint = document.getElementById("modelHint");
const systemPromptInput = document.getElementById("systemPrompt");
const includePageContentCheckbox = document.getElementById("includePageContent");
const webSearchCheckbox = document.getElementById("webSearch");

// API Provider URL mapping
const API_PROVIDERS = {
  anthropic: "https://api.anthropic.com",
  "opencode-go": "https://opencode.ai/zen/go/v1",
  custom: null,
};

function isOpenAIProvider(provider) {
  return provider === "opencode-go";
}

// State
let messages = [];
let isLoading = false;
let settings = {
  apiKey: "",
  apiProvider: "anthropic",
  customApiUrl: "",
  tavilyApiKey: "",
  model: "",
  systemPrompt: "",
  includePageContent: false,
  webSearch: false,
};

// Tavily search tool definitions
const TAVILY_SEARCH_TOOL_SCHEMA = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "検索クエリ",
    },
    max_results: {
      type: "integer",
      minimum: 1,
      maximum: 10,
      default: 5,
      description: "取得する検索結果の最大数（デフォルト: 5）",
    },
  },
  required: ["query"],
};

const TAVILY_SEARCH_TOOL_ANTHROPIC = {
  name: "tavily_search",
  description:
    "最新の情報を取得するためのWeb検索ツール。ユーザーの質問に対する最新の情報が必要な場合に検索を実行する。",
  input_schema: TAVILY_SEARCH_TOOL_SCHEMA,
};

const TAVILY_SEARCH_TOOL_OPENAI = {
  type: "function",
  function: {
    name: "tavily_search",
    description:
      "最新の情報を取得するためのWeb検索ツール。ユーザーの質問に対する最新の情報が必要な場合に検索を実行する。",
    parameters: TAVILY_SEARCH_TOOL_SCHEMA,
  },
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
  const isOpenAI = isOpenAIProvider(apiProviderSelect.value);

  // Update UI state
  fetchModelsButton.disabled = true;
  fetchModelsButton.textContent = "取得中...";
  modelHint.textContent = "モデル一覧を取得中...";
  modelHint.className = "form-hint";

  try {
    const response = await fetch(`${baseUrl}${isOpenAI ? "/models" : "/v1/models"}`, {
      method: "GET",
      headers: isOpenAI
        ? {
            Authorization: `Bearer ${apiKey}`,
          }
        : {
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
    const result = await chrome.storage.local.get(["apiKey", "apiProvider", "customApiUrl", "tavilyApiKey", "model", "systemPrompt", "includePageContent", "webSearch"]);
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
    if (result.tavilyApiKey) {
      settings.tavilyApiKey = result.tavilyApiKey;
      tavilyApiKeyInput.value = result.tavilyApiKey;
    }
    if (result.model) {
      settings.model = result.model;
    }
    if (result.systemPrompt) {
      settings.systemPrompt = result.systemPrompt;
      systemPromptInput.value = result.systemPrompt;
    }
    if (result.includePageContent !== undefined) {
      settings.includePageContent = result.includePageContent;
      includePageContentCheckbox.checked = result.includePageContent;
    }
    if (result.webSearch !== undefined) {
      settings.webSearch = result.webSearch;
      webSearchCheckbox.checked = result.webSearch;
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
      tavilyApiKey: settings.tavilyApiKey,
      model: settings.model,
      systemPrompt: settings.systemPrompt,
      includePageContent: settings.includePageContent,
      webSearch: settings.webSearch,
    });
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

// Handle include page content checkbox change
async function handleIncludePageContentChange() {
  settings.includePageContent = includePageContentCheckbox.checked;
  try {
    await chrome.storage.local.set({ includePageContent: settings.includePageContent });
  } catch (error) {
    console.error("Failed to save include page content setting:", error);
  }
}

// Handle web search checkbox change
async function handleWebSearchChange() {
  settings.webSearch = webSearchCheckbox.checked;
  try {
    await chrome.storage.local.set({ webSearch: settings.webSearch });
  } catch (error) {
    console.error("Failed to save web search setting:", error);
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

  // Close sidebar completely
  closeSidebarButton.addEventListener("click", () => {
    window.parent.postMessage({ type: "CLOSE_SIDEBAR" }, "*");
  });

  // API provider dropdown
  apiProviderSelect.addEventListener("change", updateCustomUrlVisibility);

  // Fetch models button
  fetchModelsButton.addEventListener("click", fetchModels);

  // Include page content checkbox
  includePageContentCheckbox.addEventListener("change", handleIncludePageContentChange);

  // Web search checkbox
  webSearchCheckbox.addEventListener("change", handleWebSearchChange);

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
  tavilyApiKeyInput.value = settings.tavilyApiKey;
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
  settings.tavilyApiKey = tavilyApiKeyInput.value.trim();
  settings.model = modelSelect.value || settings.model;
  settings.systemPrompt = systemPromptInput.value.trim();
  saveSettingsToStorage();
  closeSettingsModal();
}

// Render markdown to HTML
function renderMarkdown(content) {
  return marked.parse(content);
}

// Remove empty state (get fresh reference as it may be recreated by startNewChat)
function removeEmptyState() {
  const currentEmptyState = document.getElementById("emptyState");
  if (currentEmptyState) {
    currentEmptyState.remove();
  }
  summarizeButton.style.display = "none";
}

// Add message to UI
function addMessageToUI(role, content, isStreaming = false) {
  removeEmptyState();

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

// Set thinking accordion indicator icon
function setThinkingIndicator(indicator, expanded) {
  indicator.replaceChildren(createElement(expanded ? ChevronDown : ChevronRight));
}

// Create thinking (CoT) accordion
function createThinkingAccordion() {
  removeEmptyState();

  const accordion = document.createElement("div");
  accordion.className = "thinking-accordion expanded";
  accordion.id = "thinkingAccordion";

  const header = document.createElement("button");
  header.className = "thinking-header";
  header.type = "button";

  const indicator = document.createElement("span");
  indicator.className = "thinking-indicator";
  setThinkingIndicator(indicator, true);

  const brainIcon = document.createElement("span");
  brainIcon.className = "thinking-icon";
  brainIcon.appendChild(createElement(Brain));

  const label = document.createElement("span");
  label.className = "thinking-label";
  label.textContent = "Thinking...";

  header.appendChild(indicator);
  header.appendChild(brainIcon);
  header.appendChild(label);

  const body = document.createElement("div");
  body.className = "thinking-body";

  accordion.appendChild(header);
  accordion.appendChild(body);

  header.addEventListener("click", () => {
    const expanded = accordion.classList.toggle("expanded");
    setThinkingIndicator(indicator, expanded);
  });

  chatTimeline.appendChild(accordion);
  scrollToBottom();

  return accordion;
}

// Collapse thinking accordion
function collapseThinkingAccordion(accordion) {
  accordion.classList.remove("expanded");
  const indicator = accordion.querySelector(".thinking-indicator");
  if (indicator) {
    setThinkingIndicator(indicator, false);
  }
}

// Set web search accordion indicator icon
function setWebSearchIndicator(indicator, expanded) {
  indicator.replaceChildren(createElement(expanded ? ChevronDown : ChevronRight));
}

// Create web search accordion
function createWebSearchAccordion() {
  removeEmptyState();

  const accordion = document.createElement("div");
  accordion.className = "websearch-accordion";

  const header = document.createElement("button");
  header.className = "websearch-header";
  header.type = "button";

  const indicator = document.createElement("span");
  indicator.className = "websearch-indicator";
  setWebSearchIndicator(indicator, false);

  const searchIcon = document.createElement("span");
  searchIcon.className = "websearch-icon";
  searchIcon.appendChild(createElement(Search));

  const label = document.createElement("span");
  label.className = "websearch-label";
  label.textContent = "Web search...";

  header.appendChild(indicator);
  header.appendChild(searchIcon);
  header.appendChild(label);

  const body = document.createElement("div");
  body.className = "websearch-body";

  accordion.appendChild(header);
  accordion.appendChild(body);

  header.addEventListener("click", () => {
    const expanded = accordion.classList.toggle("expanded");
    setWebSearchIndicator(indicator, expanded);
  });

  chatTimeline.appendChild(accordion);
  scrollToBottom();

  return accordion;
}

// Collapse all web search accordions
function collapseWebSearchAccordions() {
  const accordions = chatTimeline.querySelectorAll(".websearch-accordion");
  accordions.forEach((accordion) => {
    const label = accordion.querySelector(".websearch-label");
    if (label && label.textContent === "Web search...") {
      label.textContent = "Web search";
    }
    accordion.classList.remove("expanded");
    const indicator = accordion.querySelector(".websearch-indicator");
    if (indicator) {
      setWebSearchIndicator(indicator, false);
    }
  });
}

// Render web search results into accordion body
function renderWebSearchResults(accordion, query, response) {
  const body = accordion.querySelector(".websearch-body");
  if (!body) return;

  body.innerHTML = "";

  const queryDiv = document.createElement("div");
  queryDiv.className = "websearch-query";
  queryDiv.textContent = `キーワード: ${query}`;
  body.appendChild(queryDiv);

  const results = response.results || [];
  if (results.length === 0) {
    const emptyDiv = document.createElement("div");
    emptyDiv.textContent = "検索結果が見つかりませんでした。";
    body.appendChild(emptyDiv);
    return;
  }

  const listDiv = document.createElement("div");
  listDiv.className = "websearch-results";

  for (const result of results) {
    const itemDiv = document.createElement("div");
    itemDiv.className = "websearch-result";

    const link = document.createElement("a");
    link.className = "websearch-result-title";
    link.href = result.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = result.title || result.url;

    const contentDiv = document.createElement("div");
    contentDiv.className = "websearch-result-content";
    contentDiv.textContent = result.content || "";

    itemDiv.appendChild(link);
    itemDiv.appendChild(contentDiv);
    listDiv.appendChild(itemDiv);
  }

  body.appendChild(listDiv);
}

// Search the web using Tavily
async function tavilySearch(query, maxResults = 5) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.tavilyApiKey}`,
    },
    body: JSON.stringify({
      query: query || "",
      max_results: Math.max(1, Math.min(10, Number(maxResults) || 5)),
      search_depth: "basic",
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.detail?.error || `Tavily API error: ${response.status}`
    );
  }

  return await response.json();
}

// Execute a Tavily search and display the results in an accordion
async function executeWebSearch(query, maxResults) {
  const accordion = createWebSearchAccordion();
  const body = accordion.querySelector(".websearch-body");

  const queryDiv = document.createElement("div");
  queryDiv.className = "websearch-query";
  queryDiv.textContent = `キーワード: ${query}`;
  body.appendChild(queryDiv);

  try {
    const result = await tavilySearch(query, maxResults);
    renderWebSearchResults(accordion, query, result);
    return result;
  } catch (error) {
    body.textContent = `検索エラー: ${error.message}`;
    return { error: error.message };
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

  // Show summarize button at the bottom of the timeline
  chatTimeline.appendChild(summarizeButton);
  summarizeButton.style.display = "block";

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

  if (settings.webSearch && !settings.tavilyApiKey) {
    showError("Tavily API Keyが設定されていません。設定ボタンから設定してください。");
    return;
  }

  // Add user message
  messages.push({ role: "user", content });
  addMessageToUI("user", content);

  // Clear input
  chatInput.value = "";
  adjustTextareaHeight();
  updateSendButtonState();

  // Check if we should include page content
  if (settings.includePageContent) {
    try {
      const pageContent = await getPageContent();
      if (pageContent) {
        const contentWithPage = `以下のWebページの内容を参考にして回答してください：\n\n${pageContent}\n\n---\n\nユーザーの質問: ${content}`;
        const messagesWithContext = [
          ...messages.slice(0, -1),
          { role: "user", content: contentWithPage },
        ];
        await sendToAPIStreaming(messagesWithContext);
        return;
      }
    } catch (error) {
      console.error("Failed to get page content:", error);
    }
  }

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

// Send to API with streaming
async function sendToAPIStreaming(customMessages = null) {
  const messagesToSend = customMessages || messages;
  if (isOpenAIProvider(settings.apiProvider)) {
    await sendToOpenAIStreaming(messagesToSend);
  } else {
    await sendToAnthropicStreaming(messagesToSend);
  }
}

// Send to Anthropic API with streaming
async function sendToAnthropicStreaming(messagesToSend) {
  isLoading = true;
  updateSendButtonState();
  summarizeButton.disabled = true;
  addLoadingIndicator();

  const maxSearchRounds = 10;

  try {
    let fullContent = "";
    let messagesForRequest = messagesToSend;
    let searchRounds = 0;
    let forceFinalAnswer = false;

    while (true) {
      const requestBody = {
        model: settings.model || "claude-sonnet-4-20250514",
        max_tokens: 4096,
        stream: true,
        messages: messagesForRequest,
      };

      // Add system prompt if configured
      if (settings.systemPrompt) {
        requestBody.system = settings.systemPrompt;
      }

      // Add tools if web search is enabled (disabled when forcing the final answer)
      if (settings.webSearch && !forceFinalAnswer) {
        requestBody.tools = [TAVILY_SEARCH_TOOL_ANTHROPIC];
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

      // Process SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const blocks = [];
      let currentText = "";
      let currentTool = null;
      let displayContent = "";

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

              if (event.type === "content_block_start") {
                const block = event.content_block;
                if (block && block.type === "tool_use") {
                  if (currentText) {
                    blocks.push({ type: "text", text: currentText });
                    currentText = "";
                    // Text was emitted before the tool call: finalize the bubble
                    // so subsequent content is displayed in a new bubble
                    finalizeStreamingMessage();
                    displayContent = "";
                    fullContent = "";
                  }
                  currentTool = { id: block.id, name: block.name, input: "" };
                }
              } else if (event.type === "content_block_delta") {
                const delta = event.delta;
                if (delta && delta.type === "text_delta" && delta.text) {
                  if (currentText === "") {
                    collapseWebSearchAccordions();
                  }
                  if (!document.getElementById("streamingMessage")) {
                    addMessageToUI("assistant", "", true);
                    displayContent = "";
                  }
                  currentText += delta.text;
                  displayContent += delta.text;
                  fullContent += delta.text;
                  updateStreamingMessage(displayContent);
                } else if (delta && delta.type === "input_json_delta" && currentTool) {
                  currentTool.input += delta.partial_json || "";
                }
              } else if (event.type === "content_block_stop") {
                if (currentTool) {
                  let input = {};
                  try {
                    input = currentTool.input ? JSON.parse(currentTool.input) : {};
                  } catch (e) {
                    input = {};
                  }
                  blocks.push({
                    type: "tool_use",
                    id: currentTool.id,
                    name: currentTool.name,
                    input,
                  });
                  currentTool = null;
                }
              } else if (event.type === "error") {
                throw new Error(event.error?.message || "Stream error");
              }
            } catch (parseError) {
              // Ignore JSON parse errors for non-JSON lines
              if (data.trim()) {
                console.warn("Failed to parse SSE data:", data);
              }
            }
          }
        }
      }

      if (currentText) {
        blocks.push({ type: "text", text: currentText });
      }

      const toolUseBlocks = blocks.filter((block) => block.type === "tool_use");
      if (toolUseBlocks.length === 0) {
        break;
      }
      searchRounds++;

      // Execute all Tavily searches and build tool results
      const toolResultBlocks = [];
      for (const toolBlock of toolUseBlocks) {
        const result = await executeWebSearch(
          toolBlock.input.query,
          toolBlock.input.max_results
        );
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: JSON.stringify(result),
        });
      }

      // Send tool results back to the model
      messagesForRequest = [
        ...messagesForRequest,
        { role: "assistant", content: blocks },
        { role: "user", content: toolResultBlocks },
      ];

      if (searchRounds >= maxSearchRounds) {
        // Limit reached: force a final answer without tools so the response never stops silently
        messagesForRequest.push({
          role: "user",
          content: "これまでの検索結果を踏まえて、最終的な回答を提供してください。これ以上のツール呼び出しは不要です。",
        });
        forceFinalAnswer = true;
      }
    }

    // Stream complete
    finalizeStreamingMessage();

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

// Send to OpenAI-compatible API with streaming
async function sendToOpenAIStreaming(messagesToSend) {
  isLoading = true;
  updateSendButtonState();
  summarizeButton.disabled = true;
  addLoadingIndicator();

  const maxSearchRounds = 10;

  try {
    const client = new OpenAI({
      apiKey: settings.apiKey,
      baseURL: API_PROVIDERS["opencode-go"],
      dangerouslyAllowBrowser: true,
    });

    const apiMessages = [];
    if (settings.systemPrompt) {
      apiMessages.push({ role: "system", content: settings.systemPrompt });
    }
    apiMessages.push(...messagesToSend);

    let fullContent = "";
    let searchRounds = 0;
    let forceFinalAnswer = false;

    while (true) {
      const params = {
        model: settings.model || "minimax-m3",
        max_tokens: 4096,
        stream: true,
        messages: apiMessages,
      };

      // Add tools if web search is enabled (disabled when forcing the final answer)
      if (settings.webSearch && !forceFinalAnswer) {
        params.tools = [TAVILY_SEARCH_TOOL_OPENAI];
      }

      const stream = await client.chat.completions.create(params);

      // Remove loading indicator and start streaming
      removeLoadingIndicator();

      let reasoningContent = "";
      let roundContent = "";
      let displayContent = "";
      let thinkingAccordion = null;
      const toolCalls = [];

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta || {};

        if (typeof delta.reasoning_content === "string" && delta.content === null) {
          if (!thinkingAccordion) {
            thinkingAccordion = createThinkingAccordion();
          }
          reasoningContent += delta.reasoning_content;
          thinkingAccordion.querySelector(".thinking-body").textContent = reasoningContent;
          scrollToBottom();
        } else if (Array.isArray(delta.tool_calls)) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index ?? 0;
            if (!toolCalls[index]) {
              toolCalls[index] = { id: "", name: "", arguments: "" };
            }
            if (toolCall.id) {
              toolCalls[index].id = toolCall.id;
            }
            if (toolCall.function?.name) {
              toolCalls[index].name = toolCall.function.name;
            }
            if (toolCall.function?.arguments) {
              toolCalls[index].arguments += toolCall.function.arguments;
            }
          }
          if (thinkingAccordion) {
            const label = thinkingAccordion.querySelector(".thinking-label");
            if (label && label.textContent === "Thinking...") {
              label.textContent = "Thinking";
            }
            if (thinkingAccordion.classList.contains("expanded")) {
              collapseThinkingAccordion(thinkingAccordion);
            }
          }
          if (roundContent) {
            // Text was emitted before the tool call: finalize the bubble
            // so subsequent content is displayed in a new bubble
            finalizeStreamingMessage();
            displayContent = "";
            fullContent = "";
          }
        } else if (typeof delta.content === "string" && delta.content && delta.reasoning_content === null) {
          if (!document.getElementById("streamingMessage")) {
            addMessageToUI("assistant", "", true);
            displayContent = "";
          }
          if (thinkingAccordion) {
            const label = thinkingAccordion.querySelector(".thinking-label");
            if (label && label.textContent === "Thinking...") {
              label.textContent = "Thinking";
            }
            if (thinkingAccordion.classList.contains("expanded")) {
              collapseThinkingAccordion(thinkingAccordion);
            }
          }
          collapseWebSearchAccordions();
          roundContent += delta.content;
          displayContent += delta.content;
          fullContent += delta.content;
          updateStreamingMessage(displayContent);
        }
      }

      const validToolCalls = toolCalls.filter(
        (toolCall) => toolCall && (toolCall.name || toolCall.id)
      );
      if (validToolCalls.length === 0) {
        break;
      }
      searchRounds++;

      // Send back assistant message with tool calls
      // DeepSeek (reasoning models) requires reasoning_content to be passed back
      const assistantToolCallMessage = {
        role: "assistant",
        content: roundContent || null,
        tool_calls: validToolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments || "{}",
          },
        })),
      };
      if (reasoningContent) {
        assistantToolCallMessage.reasoning_content = reasoningContent;
      }
      apiMessages.push(assistantToolCallMessage);

      // Execute all Tavily searches and send tool results
      for (const toolCall of validToolCalls) {
        let args = {};
        try {
          args = JSON.parse(toolCall.arguments || "{}");
        } catch (e) {
          args = {};
        }
        const result = await executeWebSearch(args.query, args.max_results);
        apiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      if (searchRounds >= maxSearchRounds) {
        // Limit reached: force a final answer without tools so the response never stops silently
        apiMessages.push({
          role: "user",
          content: "これまでの検索結果を踏まえて、最終的な回答を提供してください。これ以上のツール呼び出しは不要です。",
        });
        forceFinalAnswer = true;
      }
    }

    // Stream complete
    finalizeStreamingMessage();

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

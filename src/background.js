// Service worker: proxies API requests from the sidebar so that the
// User-Agent header can be overridden via declarativeNetRequest.

const PROXY_PORT_NAME = "api-proxy";
const USER_AGENT = `saidebar/${__BUILD_TIMESTAMP__}`;
const USER_AGENT_RULE_ID = 1;

// Override User-Agent for requests made by this extension's service worker.
// Requests from the service worker don't belong to any tab (TAB_ID_NONE).
// The rule only takes effect on hosts listed in host_permissions.
async function registerUserAgentRule() {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [USER_AGENT_RULE_ID],
    addRules: [
      {
        id: USER_AGENT_RULE_ID,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "User-Agent", operation: "set", value: USER_AGENT },
          ],
        },
        condition: {
          tabIds: [chrome.tabs.TAB_ID_NONE],
          initiatorDomains: [chrome.runtime.id],
        },
      },
    ],
  });
}

const userAgentRuleReady = registerUserAgentRule().catch((error) => {
  console.error("Failed to register User-Agent rule:", error);
});

function safePostMessage(port, message) {
  try {
    port.postMessage(message);
    return true;
  } catch (error) {
    // Port was disconnected by the sidebar
    return false;
  }
}

async function handleProxyRequest(port, request, signal) {
  try {
    await userAgentRuleReady;

    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal,
    });

    const posted = safePostMessage(port, {
      type: "head",
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
    });
    if (!posted) return;

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const data = decoder.decode(value, { stream: true });
        if (data && !safePostMessage(port, { type: "chunk", data })) {
          reader.cancel().catch(() => {});
          return;
        }
      }
      const rest = decoder.decode();
      if (rest) safePostMessage(port, { type: "chunk", data: rest });
    }

    safePostMessage(port, { type: "end" });
  } catch (error) {
    if (signal.aborted) return;
    safePostMessage(port, { type: "error", message: error.message || String(error) });
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PROXY_PORT_NAME) return;

  // Only accept connections from extension pages (the sidebar iframe)
  if (!port.sender?.url?.startsWith(chrome.runtime.getURL(""))) {
    port.disconnect();
    return;
  }

  const controller = new AbortController();
  port.onDisconnect.addListener(() => controller.abort());

  port.onMessage.addListener((message) => {
    if (message?.type === "request") {
      handleProxyRequest(port, message.request, controller.signal);
    }
  });
});

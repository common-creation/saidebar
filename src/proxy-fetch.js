// fetch-compatible function that sends requests through the service worker
// (background.js) and receives the response body as a stream.

const PROXY_PORT_NAME = "api-proxy";
const NULL_BODY_STATUSES = [101, 103, 204, 205, 304];

function createAbortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

export function proxyFetch(input, init = {}) {
  const url = input instanceof Request ? input.url : String(input);
  const method = (init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers = [...new Headers(init.headers).entries()];
  const body = init.body ?? undefined;
  const signal = init.signal;

  if (body !== undefined && typeof body !== "string") {
    return Promise.reject(new TypeError("proxyFetch only supports string request bodies"));
  }
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: PROXY_PORT_NAME });
    const encoder = new TextEncoder();
    let streamController = null;
    let settled = false; // response promise resolved/rejected
    let finished = false; // body stream closed/errored

    const finish = () => {
      finished = true;
      signal?.removeEventListener("abort", onAbort);
      port.disconnect();
    };

    const fail = (error) => {
      if (finished) return;
      if (!settled) {
        settled = true;
        reject(error);
      } else if (streamController) {
        streamController.error(error);
      }
      finish();
    };

    const onAbort = () => fail(createAbortError());
    signal?.addEventListener("abort", onAbort, { once: true });

    const stream = new ReadableStream({
      start(controller) {
        streamController = controller;
      },
      cancel() {
        if (!finished) finish();
      },
    });

    port.onMessage.addListener((message) => {
      if (finished) return;
      switch (message.type) {
        case "head": {
          settled = true;
          const hasBody = !NULL_BODY_STATUSES.includes(message.status);
          resolve(
            new Response(hasBody ? stream : null, {
              status: message.status,
              statusText: message.statusText,
              headers: message.headers,
            })
          );
          if (!hasBody) finish();
          break;
        }
        case "chunk":
          streamController.enqueue(encoder.encode(message.data));
          break;
        case "end":
          streamController.close();
          finish();
          break;
        case "error":
          fail(new TypeError(message.message || "Failed to fetch"));
          break;
      }
    });

    port.onDisconnect.addListener(() => {
      fail(new TypeError("Connection to service worker was lost"));
    });

    port.postMessage({
      type: "request",
      request: { url, method, headers, body },
    });
  });
}

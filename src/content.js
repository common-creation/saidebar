(function () {
  const SIDEBAR_WIDTH = 400;
  const SIDEBAR_ID = "saidebar-root";
  const STORAGE_KEY_POSITION = "saidebar-toggle-position";
  const DRAG_THRESHOLD = 5; // pixels to distinguish drag from click

  // State (preserved across re-injections)
  let isOpen = false;
  let togglePositionY = 50; // percentage from top (default: center)
  let root = null;
  let shadow = null;
  let container = null;
  let toggleButton = null;
  let iframe = null;

  // Drag state
  let isDragging = false;
  let dragStartY = 0;
  let dragStartPositionY = 0;
  let hasDragged = false;

  // Load saved position
  async function loadPosition() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEY_POSITION]);
      if (result[STORAGE_KEY_POSITION] !== undefined) {
        togglePositionY = result[STORAGE_KEY_POSITION];
      }
    } catch (error) {
      console.error("Failed to load toggle position:", error);
    }
  }

  // Save position
  async function savePosition() {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY_POSITION]: togglePositionY });
    } catch (error) {
      console.error("Failed to save toggle position:", error);
    }
  }

  // Create sidebar elements
  function createSidebar() {
    // Check if already exists
    if (document.getElementById(SIDEBAR_ID)) {
      return;
    }

    // Create root container
    root = document.createElement("div");
    root.id = SIDEBAR_ID;

    // Create Shadow DOM for isolation from host page CSS
    shadow = root.attachShadow({ mode: "closed" });

    // Inject styles into Shadow DOM
    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
        position: fixed;
        top: 0;
        right: 0;
        height: 100vh;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        pointer-events: none;
        background: transparent;
      }

      * {
        box-sizing: border-box;
      }

      .saidebar-container {
        position: relative;
        display: flex;
        height: 100%;
        transform: translateX(${SIDEBAR_WIDTH}px);
        transition: transform 0.3s ease;
      }

      .saidebar-container.open {
        transform: translateX(0);
      }

      .saidebar-toggle-wrapper {
        position: absolute;
        right: ${SIDEBAR_WIDTH}px;
        transform: translateY(-50%);
        pointer-events: auto;
      }

      .saidebar-toggle {
        width: 32px;
        height: 48px;
        background: #3b82f6d0;
        border: none;
        border-radius: 8px 0 0 8px;
        cursor: grab;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
        transition: background-color 0.2s ease;
        user-select: none;
        backdrop-filter: blur(2px);
      }

      .saidebar-toggle:hover {
        background: #2563eb;
      }

      .saidebar-toggle:active {
        cursor: grabbing;
      }

      .saidebar-toggle.dragging {
        cursor: grabbing;
        background: #1d4ed8;
      }

      .saidebar-toggle-icon {
        width: 16px;
        height: 16px;
        fill: white;
        transition: transform 0.3s ease;
        pointer-events: none;
      }

      .saidebar-toggle-icon.open {
        transform: rotate(180deg);
      }

      .saidebar-panel {
        pointer-events: auto;
        width: ${SIDEBAR_WIDTH}px;
        height: 100%;
        background: transparent;
        box-shadow: -4px 0 16px rgba(0, 0, 0, 0.1);
        margin-left: auto;
      }

      .saidebar-iframe {
        width: 100%;
        height: 100%;
        border: none;
      }
    `;
    shadow.appendChild(style);

    // Create container
    container = document.createElement("div");
    container.className = "saidebar-container";
    if (isOpen) {
      container.classList.add("open");
    }
    shadow.appendChild(container);

    // Create toggle wrapper (for positioning)
    const toggleWrapper = document.createElement("div");
    toggleWrapper.className = "saidebar-toggle-wrapper";
    toggleWrapper.style.top = `${togglePositionY}%`;
    container.appendChild(toggleWrapper);

    // Create toggle button
    toggleButton = document.createElement("button");
    toggleButton.className = "saidebar-toggle";
    toggleButton.title = "Toggle Sidebar (drag to move)";
    toggleButton.innerHTML = `
      <svg class="saidebar-toggle-icon${isOpen ? " open" : ""}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
      </svg>
    `;
    toggleWrapper.appendChild(toggleButton);

    // Create sidebar panel
    const panel = document.createElement("div");
    panel.className = "saidebar-panel";
    container.appendChild(panel);

    // Create iframe for sidebar content (additional CSS isolation)
    iframe = document.createElement("iframe");
    iframe.className = "saidebar-iframe";
    iframe.src = chrome.runtime.getURL("sidebar.html");
    panel.appendChild(iframe);

    // Setup drag events
    setupDragEvents(toggleWrapper);

    // Append to body
    document.body.appendChild(root);
  }

  // Setup drag events
  function setupDragEvents(toggleWrapper) {
    toggleButton.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return; // Only left click

      isDragging = true;
      hasDragged = false;
      dragStartY = e.clientY;
      dragStartPositionY = togglePositionY;
      toggleButton.classList.add("dragging");

      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      const deltaY = e.clientY - dragStartY;

      // Check if we've moved enough to consider it a drag
      if (Math.abs(deltaY) > DRAG_THRESHOLD) {
        hasDragged = true;
      }

      // Calculate new position as percentage
      const windowHeight = window.innerHeight;
      const deltaPercent = (deltaY / windowHeight) * 100;
      let newPositionY = dragStartPositionY + deltaPercent;

      // Clamp to valid range (5% to 95% to keep button visible)
      newPositionY = Math.max(5, Math.min(95, newPositionY));

      togglePositionY = newPositionY;
      toggleWrapper.style.top = `${togglePositionY}%`;
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;

      isDragging = false;
      toggleButton.classList.remove("dragging");

      if (hasDragged) {
        // Save position after drag
        savePosition();
      } else {
        // It was a click, toggle sidebar
        toggleSidebar();
      }
    });

    // Touch support
    toggleButton.addEventListener("touchstart", (e) => {
      const touch = e.touches[0];
      isDragging = true;
      hasDragged = false;
      dragStartY = touch.clientY;
      dragStartPositionY = togglePositionY;
      toggleButton.classList.add("dragging");
    }, { passive: true });

    document.addEventListener("touchmove", (e) => {
      if (!isDragging) return;

      const touch = e.touches[0];
      const deltaY = touch.clientY - dragStartY;

      if (Math.abs(deltaY) > DRAG_THRESHOLD) {
        hasDragged = true;
      }

      const windowHeight = window.innerHeight;
      const deltaPercent = (deltaY / windowHeight) * 100;
      let newPositionY = dragStartPositionY + deltaPercent;

      newPositionY = Math.max(5, Math.min(95, newPositionY));

      togglePositionY = newPositionY;
      toggleWrapper.style.top = `${togglePositionY}%`;
    }, { passive: true });

    document.addEventListener("touchend", () => {
      if (!isDragging) return;

      isDragging = false;
      toggleButton.classList.remove("dragging");

      if (hasDragged) {
        savePosition();
      } else {
        toggleSidebar();
      }
    });
  }

  // Toggle function
  function toggleSidebar() {
    isOpen = !isOpen;
    if (container) {
      container.classList.toggle("open", isOpen);
    }
    if (toggleButton) {
      const icon = toggleButton.querySelector(".saidebar-toggle-icon");
      if (icon) {
        icon.classList.toggle("open", isOpen);
      }
    }
  }

  // Listen for messages from iframe
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "GET_PAGE_CONTENT") {
      const pageContent = getPageContent();
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          { type: "PAGE_CONTENT", content: pageContent },
          "*"
        );
      }
    }
  });

  // Get page content
  function getPageContent() {
    const title = document.title;
    const url = window.location.href;

    const bodyClone = document.body.cloneNode(true);

    const removeSelectors = [
      "script",
      "style",
      "noscript",
      "iframe",
      "nav",
      "header",
      "footer",
      "aside",
      "[role='navigation']",
      "[role='banner']",
      "[role='contentinfo']",
      ".sidebar",
      ".nav",
      ".menu",
      ".advertisement",
      ".ad",
      "#saidebar-root",
    ];

    removeSelectors.forEach((selector) => {
      bodyClone.querySelectorAll(selector).forEach((el) => el.remove());
    });

    let textContent = bodyClone.innerText || bodyClone.textContent || "";

    textContent = textContent
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim();

    const maxLength = 10000;
    if (textContent.length > maxLength) {
      textContent = textContent.substring(0, maxLength) + "...";
    }

    return `Title: ${title}\nURL: ${url}\n\nContent:\n${textContent}`;
  }

  // Check and re-inject sidebar if removed
  function ensureSidebar() {
    if (!document.getElementById(SIDEBAR_ID) && document.body) {
      createSidebar();
    }
  }

  // Initialize with delay for SPA frameworks
  async function init() {
    // Load saved position first
    await loadPosition();

    // Initial creation
    if (document.body) {
      createSidebar();
    }

    // Observe DOM changes to detect removal
    const observer = new MutationObserver((mutations) => {
      // Check if our sidebar was removed
      let sidebarRemoved = false;
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (node.id === SIDEBAR_ID || (node.contains && root && node.contains(root))) {
            sidebarRemoved = true;
            break;
          }
        }
        if (sidebarRemoved) break;
      }

      if (sidebarRemoved || !document.getElementById(SIDEBAR_ID)) {
        // Re-inject after a short delay to let framework finish its work
        setTimeout(ensureSidebar, 100);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Also check periodically as a fallback
    setInterval(ensureSidebar, 2000);
  }

  // Start initialization
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // Delay slightly to let SPA frameworks initialize
    setTimeout(init, 100);
  }
})();

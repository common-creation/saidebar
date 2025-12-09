# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

sAIdebar is a Chrome extension that adds an AI chat sidebar to any webpage. It uses the Anthropic Claude API for AI responses and does not rely on Chrome's sidePanel API for broader compatibility.

## Commands

```bash
# Build for production (output to dist/)
npm run build

# Watch mode for development (auto-rebuild on changes)
npm run watch

# Clean build artifacts
npm run clean

# Build and package as .crx file
npm run package
```

## Architecture

### Extension Structure

The extension uses a **content script + iframe** architecture to isolate the sidebar UI from host pages:

1. **content.js** (content script)
   - Injected into all pages
   - Creates a Shadow DOM container for CSS isolation
   - Hosts an iframe that loads sidebar.html
   - Manages toggle button and sidebar open/close state
   - Handles drag-to-reposition functionality
   - Extracts page content for summarization via postMessage

2. **sidebar.js** (iframe app)
   - Chat interface with streaming responses
   - Communicates with content.js via postMessage for page content
   - Calls Anthropic API directly from browser (uses `anthropic-dangerous-direct-browser-access` header)
   - Supports multiple API providers (Anthropic, Z.AI, custom endpoints)
   - Renders markdown responses using the `marked` library

3. **sidebar.html / sidebar.css**
   - Dark-themed chat UI
   - Settings modal for API key, provider, model selection, and system prompt

### Build System

**build.js** uses esbuild to:
- Bundle sidebar.js with dependencies (marked) into IIFE format
- Copy static files (content.js, HTML, CSS, manifest) to dist/
- Support watch mode with sourcemaps

### Data Flow

```
Host Page <--postMessage--> Content Script (Shadow DOM) <--iframe.src--> Sidebar App
                                                                              |
                                                                              v
                                                                        Anthropic API
```

## Key Implementation Details

- **CSS Isolation**: Shadow DOM (closed mode) + iframe prevents style conflicts with host pages
- **Position Persistence**: Toggle button position saved to chrome.storage.local
- **Sidebar Re-injection**: MutationObserver + periodic check ensures sidebar survives SPA navigation
- **Streaming**: SSE parsing for real-time API response display
- **Markdown**: Custom preprocessing for Japanese bold/italic text before marked parsing

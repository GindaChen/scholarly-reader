# 📖 Scholarly Reader

[![CI](https://github.com/GindaChen/scholarly-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/GindaChen/scholarly-reader/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Interactive academic paper reader with variable annotations, math rendering, and AI-powered arXiv import.**

Scholarly Reader transforms dense academic papers into an interactive reading experience — color-coded variable tracking, inline reference popups, annotation persistence, and an AI agent that imports arXiv papers with a single command.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎨 **Variable Annotations** | Color-coded mathematical symbols with hover-to-highlight across the entire paper |
| 📐 **KaTeX Math Rendering** | Beautiful server-side rendered equations |
| 📚 **Three-Panel Layout** | Variables · Article · References — all collapsible and resizable |
| 🤖 **AI arXiv Import** | Paste an arXiv ID → agent downloads, converts, and annotates the paper |
| ✏️ **Highlights & Notes** | Select text to highlight, annotate, or collapse with custom summaries |
| 🌲 **Tree-based Undo/Redo** | Git-like branching edit history with annotation sync |
| 🔍 **Multi-split Views** | Clone the document into independent scrolling panes |
| 📑 **Table of Contents** | Persistent TOC with active section highlighting |
| 🎭 **Focus Mode** | Zen reading: hides panels, dims nav, article-only |
| 🖥️ **Electron Desktop App** | Native macOS window with proper keyboard shortcuts |
| 🎨 **4 Themes** | Midnight, Parchment, Ocean, Forest |

## 🚀 Quick Start

### Web Server

```bash
# Clone
git clone https://github.com/GindaChen/scholarly-reader.git
cd scholarly-reader

# Install
npm install

# Run
npm start
# → http://localhost:3003
```

### Desktop App (Electron)

```bash
npm run electron
# or with DevTools:
npm run electron-dev
```

### Import an arXiv Paper

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Import by arXiv ID
npm run import -- 1706.03762
```

## 📁 Project Structure

```
├── server.js              # Express backend (routes, annotation API)
├── main.js                # Electron main process
├── arxiv-pipeline.js      # arXiv TeX→HTML import pipeline
├── tex2html.js            # LaTeX→HTML converter
├── tools/                 # Pipeline sub-tools (math, tables, figures, refs)
├── agents/import-agent/   # LLM-native paper import agent (pi-agent-core)
├── prompts/               # LLM prompt templates
├── public/                # Frontend (reader.js, reader.css, index.html)
├── docs/                  # Paper documents
├── data/annotations/      # Persisted annotation JSON
└── tests/                 # Smoke tests
```

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `?` | Show keyboard shortcuts |
| `f` | Toggle focus mode |
| `t` | Toggle table of contents |
| `e` | Toggle eraser mode |
| `⌘Z` | Undo |
| `⌘⇧Z` | Redo |
| `⌘1/2/3` | Toggle Variables / References / Notes panel |
| `Esc` | Close any open panel or dialog |

## 🔧 Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required for AI import agent
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Optional overrides
# PI_PROVIDER=anthropic
# PI_MODEL=claude-sonnet-4-20250514
# PORT=3003
```

## 🧪 Testing

```bash
npm test
```

## 📜 License

[MIT](LICENSE)

# Scholarly Reader — Wishlist & Roadmap

## ✅ Done
- [x] Three-panel layout: Left (variables) | Center (article) | Right (references)
- [x] Notes as separate right panel (doesn't overlap references)
- [x] Main content fills full width between panels
- [x] All panels collapsible with smooth animation
- [x] Panel state persistence in localStorage
- [x] Agent-generated HTML architecture (no client-side compilers)
- [x] Variable annotations with color-coded highlighting + hover
- [x] Inline reference badges with detail view
- [x] Selection toolbar (copy + note)
- [x] Resizable references panel
- [x] Table of contents dropdown
- [x] Demo: "Attention Is All You Need" full paper (`attention-paper.html`)
- [x] Demo: Study guide version (`sample-paper.html`)
- [x] **Fix math rendering** — Semantic CSS math classes (`m-frac`, `m-sup`, etc.)
- [x] **Settings button** — Gear icon in nav bar with dropdown
- [x] **Theme system** — 4 themes (Midnight, Parchment, Ocean, Forest)
- [x] **Right-click context menus** — Edit variable descriptions + add ref notes
- [x] **Reference font fix** — Non-italic, clean readable font
- [x] **User inline notes** — Cyan-colored annotations on references, persisted
- [x] **Document picker** — Click title → dropdown to switch between docs
- [x] **Typography controls** — Font family (Serif/Sans/Mono) + size (S/M/L/XL) in settings
- [x] **Reading progress bar** — Thin accent bar at top showing scroll position
- [x] **Keyboard shortcuts** — `?` for help, `f` focus mode, `t` TOC, `Esc` close
- [x] **Focus mode** — Zen reading: hides panels, dims nav, article-only
- [x] **Markdown rendering** — Server-side MD→HTML with `marked` (tables, code, math, blockquotes)
- [x] **Text highlighting** — 3 presets (background, bold, underline) + localStorage persistence
- [x] **Variable click-to-pin** — Click toggles persistent highlight with outline, supports multi-select
- [x] **Dropdown position fix** — Doc picker dropdown properly aligned
- [x] **Text collapse/summarize** — Select text → shrink to expandable summary
- [x] **Eraser mode** — Toggle eraser button → click highlights to remove (replaces right-click)
- [x] **Undo/Redo** — ⌘Z / ⌘⇧Z or toolbar buttons, records DOM snapshots (cap 50)
- [x] **Electron navbar styling** — Taller navbar, drag region, padding for macOS traffic lights
- [x] **Unified annotation system** — Highlights, notes, collapses stored via backend JSON API (no localStorage)
- [x] **Advanced collapses** — Custom replacement text via prompt, hover tooltip, click-to-expand/collapse
- [x] **Tree-based edit history** — Git-like branching undo/redo with annotation sync on checkout
- [x] **Variable navigation** — `<` `>` arrow buttons with counter + `↑` jump-to-definition
- [x] **Right-click variable editor** — Popup for editing description + personal notes
- [x] **Multi-split views** — Clone document into upper/lower splits with independent scrolling
- [x] **Variable filtering** — Search bar to filter variables by name or description
- [x] **Variable sorting** — Sort by alphabetical, first occurrence, or group by chapter
- [x] **Pin/unpin all toggle** — Batch pin management in variables panel
- [x] **Persistent TOC** — TOC dropdown stays open, highlights active section
- [x] **Split orientation toggle** — Switch between horizontal (left/right) and vertical (up/down) splits
- [x] **Markdown paper format** — `attention-paper.md` with `@var-region`/`@var-defs` directives
- [x] **LaTeX source import** — `tex2html.js` converter, renders arXiv `.tex` papers as HTML
- [x] **Doc picker fix** — Robust click handling with `closest()` for Electron compatibility
- [x] **Tooltips on all buttons** — Title-based tooltips for every navbar/toolbar icon
- [x] **Annotation minimap** — Side gutter with colored dots showing annotation positions
- [x] **ArXiv paper import** — Paste URL → agent fetches, parses, and annotates the paper
- [x] **AI Chat widget** — Bottom-right expandable chat panel for Q&A about the paper
- [x] **Text-to-AI reference** — Select text → "Explain this" with passage as context

## 🚀 Next Up (Priority)
- [ ] **Shortcut key tuning** — User-customizable keyboard shortcuts in settings

## 🏗️ Incubation & Scaling Plan

### Standalone Repository
The Scholarly Reader has outgrown its sandbox home. Plan to extract into its own repo:
- **New repo:** `scholarly-reader` (standalone)
- **Package as:** Electron app (desktop) + hosted web version
- **Publish:** npm package for the server, Homebrew cask for the app

### Agent-Powered Paper Translation Pipeline
Use AI agents to automate converting any paper format into the annotated reader format:
- **arXiv → Reader:** Paste arXiv ID → agent downloads TeX source → `tex2html.js` converts → auto-annotates variables
- **PDF → Reader:** Upload PDF → agent extracts text/math/figures → generates HTML with annotations
- **Agent variable annotator:** LLM reads the paper, identifies all mathematical variables, generates `@var-defs` blocks
- **Citation enrichment:** Agent resolves `\citep{}` keys → fetches title/URL/abstract from Semantic Scholar API
- **Figure extraction:** OCR + captioning for figures, embedded inline
- **Custom LaTeX macro resolution** — Papers define macros like `\newcommand{\dmodel}{d_{\text{model}}}` that KaTeX doesn't know about. The agent needs to either: (1) extract custom macros from the `.tex` preamble and pass them to KaTeX, or (2) have the LLM expand all custom macros to standard LaTeX during translation. Without this, every `\dmodel` renders as red error text and can cascade into corrupted HTML (see 1706.03762 §3.1). _Defer until after DistCA paper test run._
- **Footnote-in-math handling** — LaTeX footnotes containing math (e.g., `\footnote{$\sum q_ik_i$ has mean 0...}`) break the paragraph structure during LLM translation, causing downstream HTML corruption where figures/headings get entity-escaped instead of rendered. Seen in 1706.03762 §3.2.1.

### Interesting Problems & Visualizations to Tackle
- [ ] **Equation dependency graph** — Click a variable → see which equations use it, trace the computation DAG
- [ ] **Attention pattern visualizer** — For transformer papers, render interactive attention heatmaps (the paper's own figures show these)
- [ ] **Proof tree navigator** — For theory papers, visualize theorem→lemma→proof chains as collapsible trees
- [ ] **Notation comparison** — Side-by-side view of how different papers name the same concept (e.g., "hidden state" = h_t vs z_t vs s_t)
- [ ] **Hyperparameter dashboard** — Extract all numbers from training sections → interactive table with sliders for "what if" exploration
- [ ] **Timeline view** — Chronological view of cited papers → see how ideas evolved
- [ ] **Paper diff** — Two versions of the same paper (e.g., v1 vs v5 on arXiv) → highlighted changes
- [ ] **Reading comprehension quiz** — Auto-generated from the paper's key claims and variable definitions
- [ ] **Live code blocks** — Runnable Python/JS snippets embedded in the paper (like the PyTorch attention example in sample-paper.md)
- [ ] **Cross-paper variable linking** — When reading Paper B that cites Paper A, show Paper A's variable definitions inline

## 💡 Agent Vision (Future)
- [ ] **Interactive annotation agent** — Select unannotated symbol → AI adds it to variable definitions
- [ ] **Citation graph** — Visual network of how references relate to each other
- [ ] **Reading session tracker** — Time spent per section, highlight heatmaps
- [ ] **Collaborative annotations** — Share annotated papers with others via link
- [ ] **Paper comparison mode** — Side-by-side view of two related papers
- [ ] **Spaced repetition flashcards** — Auto-generate from variables and key concepts

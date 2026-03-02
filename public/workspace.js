/**
 * Scholarly Reader — Workspace View
 *
 * NotebookLM-style workspace with:
 *   1. Sources panel (left) — list/select documents
 *   2. Chat panel (center) — conversational AI agent
 *   3. Studio panel (right) — rich AI operations
 */

(function () {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    // ═══════════════════════════════════════════════
    //  State
    // ═══════════════════════════════════════════════

    const state = {
        sources: [],            // { id, title, short_title, checked, ... }
        chatMessages: [],       // { role: 'user'|'assistant', content }
        operations: [],         // { id, type, status: 'running'|'done', result }
        streaming: false,
    };

    // ═══════════════════════════════════════════════
    //  Init
    // ═══════════════════════════════════════════════

    async function init() {
        await loadSources();
        setupSourceInteractions();
        setupChat();
        setupStudio();
        setupResultModal();
        setupImport();
        generateSuggestions();
    }

    // ═══════════════════════════════════════════════
    //  Sources
    // ═══════════════════════════════════════════════

    async function loadSources() {
        try {
            const res = await fetch('/api/docs');
            const docs = await res.json();
            state.sources = docs.map(d => ({
                ...d,
                checked: true, // Select all by default
            }));
            renderSources();
            updateSourceCount();
        } catch (err) {
            console.error('Failed to load sources:', err);
        }
    }

    function renderSources() {
        const list = $('#sources-list');
        const search = ($('#source-search')?.value || '').toLowerCase();

        const filtered = state.sources.filter(s =>
            !search || s.title.toLowerCase().includes(search) ||
            (s.short_title || '').toLowerCase().includes(search)
        );

        list.innerHTML = filtered.map(s => `
            <div class="source-item ${s.checked ? 'selected' : ''}" data-id="${s.id}">
                <input type="checkbox" class="source-checkbox" ${s.checked ? 'checked' : ''} data-id="${s.id}">
                <div class="source-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </div>
                <div class="source-info">
                    <div class="source-title">${escHtml(s.short_title || s.title)}</div>
                    <div class="source-meta">${s.authors ? s.authors.split(',')[0] + (s.authors.includes(',') ? ' et al.' : '') : ''}${s.year ? ' · ' + s.year : ''}${s.type === 'arxiv-paper' ? ' · arXiv' : ''}</div>
                </div>
            </div>
        `).join('');
    }

    function setupSourceInteractions() {
        const list = $('#sources-list');
        const searchInput = $('#source-search');
        const selectAllBtn = $('#select-all-btn');
        const addSourceBtn = $('#btn-add-source');

        // Checkbox toggle
        list.addEventListener('click', (e) => {
            const item = e.target.closest('.source-item');
            if (!item) return;

            const id = item.dataset.id;
            const checkbox = item.querySelector('.source-checkbox');

            // If clicking the item (not directly the checkbox), toggle the checkbox
            if (e.target !== checkbox) {
                // Check if it's the title being clicked — open the reader
                if (e.target.closest('.source-title')) {
                    window.open(`/?doc=${id}`, '_blank');
                    return;
                }
                checkbox.checked = !checkbox.checked;
            }

            const src = state.sources.find(s => s.id === id);
            if (src) {
                src.checked = checkbox.checked;
                item.classList.toggle('selected', src.checked);
            }
            updateSourceCount();
        });

        // Search filter
        searchInput.addEventListener('input', () => renderSources());

        // Select all
        selectAllBtn.addEventListener('click', () => {
            const allChecked = state.sources.every(s => s.checked);
            state.sources.forEach(s => s.checked = !allChecked);
            renderSources();
            updateSourceCount();
            selectAllBtn.textContent = allChecked ? 'Select all' : 'Deselect all';
        });

        // Add source → import modal
        addSourceBtn.addEventListener('click', () => {
            $('#btn-import')?.click();
        });
    }

    function updateSourceCount() {
        const count = state.sources.filter(s => s.checked).length;
        const indicator = $('#chat-source-indicator');
        const counter = $('#source-count');

        if (indicator) indicator.textContent = `${count} source${count !== 1 ? 's' : ''}`;
        if (counter) counter.textContent = `${count} source${count !== 1 ? 's' : ''} selected`;
    }

    function getSelectedSourceIds() {
        return state.sources.filter(s => s.checked).map(s => s.id);
    }

    // ═══════════════════════════════════════════════
    //  Chat
    // ═══════════════════════════════════════════════

    function setupChat() {
        const input = $('#chat-input');
        const sendBtn = $('#chat-send');

        // Auto-resize textarea
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
            sendBtn.classList.toggle('active', input.value.trim().length > 0);
        });

        // Send on Enter (Shift+Enter for newline)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        sendBtn.addEventListener('click', sendMessage);
    }

    async function sendMessage() {
        const input = $('#chat-input');
        const text = input.value.trim();
        if (!text || state.streaming) return;

        // Hide empty state
        const emptyEl = $('#chat-empty');
        if (emptyEl) emptyEl.style.display = 'none';

        // Add user message
        addMessage('user', text);
        input.value = '';
        input.style.height = 'auto';
        $('#chat-send').classList.remove('active');

        // Build context from selected sources
        const selectedIds = getSelectedSourceIds();
        let context = '';
        if (selectedIds.length > 0 && selectedIds.length <= 3) {
            // Fetch first few source contents for context
            try {
                const contents = await Promise.all(
                    selectedIds.slice(0, 3).map(async id => {
                        const res = await fetch(`/api/doc/${id}`);
                        const data = await res.json();
                        // Strip HTML tags for context
                        const textContent = data.content
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .slice(0, 4000);
                        return `--- ${data.title} ---\n${textContent}`;
                    })
                );
                context = contents.join('\n\n');
            } catch (err) {
                console.warn('Failed to fetch source context:', err);
            }
        } else if (selectedIds.length > 3) {
            // Too many sources, just use titles
            const titles = state.sources.filter(s => s.checked).map(s => s.title);
            context = `Selected sources: ${titles.join(', ')}`;
        }

        // Stream response
        state.streaming = true;
        const msgEl = addMessage('assistant', '');
        const contentEl = msgEl.querySelector('.msg-content');

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: text, context }),
            });

            if (!res.ok) {
                const err = await res.json();
                contentEl.innerHTML = `<em style="color: var(--text-warning)">Error: ${escHtml(err.error || 'Failed to get response')}</em>`;
                state.streaming = false;
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.done) break;
                        if (data.error) {
                            contentEl.innerHTML += `<em style="color: var(--text-warning)">Error: ${escHtml(data.error)}</em>`;
                            break;
                        }
                        if (data.content) {
                            fullContent += data.content;
                            contentEl.innerHTML = renderMarkdown(fullContent);
                        }
                    } catch { }
                }
            }

            // Add follow-up suggestions
            state.chatMessages.push({ role: 'assistant', content: fullContent });
            addFollowUpSuggestions(fullContent);

        } catch (err) {
            contentEl.innerHTML = `<em style="color: var(--text-warning)">Connection error: ${escHtml(err.message)}</em>`;
        }

        state.streaming = false;
    }

    function addMessage(role, content) {
        const container = $('#chat-messages');
        const div = document.createElement('div');
        div.className = `msg msg-${role}`;

        if (role === 'user') {
            div.innerHTML = `<div class="msg-content">${escHtml(content)}</div>`;
            state.chatMessages.push({ role, content });
        } else {
            div.innerHTML = `
                <div class="msg-content">${content ? renderMarkdown(content) : '<span style="color:var(--text-tertiary)">Thinking…</span>'}</div>
                <div class="msg-actions">
                    <button class="msg-action-btn" data-action="copy" title="Copy response">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                        </svg>
                    </button>
                    <button class="msg-action-btn" data-action="like" title="Good response">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"></path>
                        </svg>
                    </button>
                    <button class="msg-action-btn" data-action="dislike" title="Bad response">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"></path>
                        </svg>
                    </button>
                </div>
            `;

            // Copy action
            div.querySelector('[data-action="copy"]')?.addEventListener('click', () => {
                const text = div.querySelector('.msg-content').textContent;
                navigator.clipboard.writeText(text);
            });
        }

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
        return div;
    }

    function addFollowUpSuggestions(responseContent) {
        // Generate contextual follow-ups based on the response
        const suggestions = generateFollowUps(responseContent);
        if (suggestions.length === 0) return;

        const container = $('#chat-messages');
        const row = document.createElement('div');
        row.className = 'followup-row';
        row.innerHTML = suggestions.map(q =>
            `<button class="followup-btn">${escHtml(q)}</button>`
        ).join('');

        row.querySelectorAll('.followup-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $('#chat-input').value = btn.textContent;
                row.remove();
                sendMessage();
            });
        });

        container.appendChild(row);
        container.scrollTop = container.scrollHeight;
    }

    function generateFollowUps(content) {
        // Simple heuristic: generate questions from the response
        const topics = [];
        const lines = content.split('\n').filter(l => l.trim());

        // Extract key phrases from bold text
        const boldMatches = content.match(/\*\*([^*]+)\*\*/g);
        if (boldMatches && boldMatches.length > 0) {
            const phrase = boldMatches[0].replace(/\*\*/g, '');
            topics.push(`Tell me more about ${phrase}`);
        }

        // Generic follow-ups
        if (content.length > 200) {
            topics.push('Can you summarize this more concisely?');
        }
        topics.push('What are the key takeaways?');

        return topics.slice(0, 3);
    }

    function generateSuggestions() {
        const container = $('#chat-suggestions');
        if (!container) return;

        const suggestions = [];
        if (state.sources.length > 0) {
            const first = state.sources[0];
            suggestions.push(`What is "${first.short_title || first.title}" about?`);
            if (state.sources.length > 1) {
                suggestions.push('Compare the methodologies across my sources');
            }
            suggestions.push('What are the key contributions?');
        } else {
            suggestions.push('Import a paper from arXiv to get started');
        }

        container.innerHTML = suggestions.map(q =>
            `<button class="chat-suggestion">${escHtml(q)}</button>`
        ).join('');

        container.querySelectorAll('.chat-suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                $('#chat-input').value = btn.textContent;
                sendMessage();
            });
        });
    }

    // ═══════════════════════════════════════════════
    //  Studio Operations
    // ═══════════════════════════════════════════════

    const OPERATIONS = {
        summary: {
            label: 'Summary Report',
            prompt: `Generate a comprehensive summary report of the provided academic paper(s). Structure it as:

## Executive Summary
(2-3 sentences)

## Key Contributions
(Numbered list)

## Methodology
(Paragraph)

## Results & Findings
(Key results with numbers)

## Limitations & Open Questions
(Bullet points)

## Significance
(Why this matters)

Use bold for key terms and technical vocabulary.`,
        },
        flashcards: {
            label: 'Flashcards',
            prompt: `Generate study flashcards from the provided academic paper(s). Create 10-15 flashcards in this format:

## Flashcard 1
**Q:** [Question]
**A:** [Answer]

---

## Flashcard 2
**Q:** [Question]
**A:** [Answer]

Cover: key definitions, core concepts, methodology steps, important results, and notable formulas. Make questions specific and answers concise.`,
        },
        quiz: {
            label: 'Quiz',
            prompt: `Generate a multiple-choice quiz from the provided academic paper(s). Create 8-10 questions:

## Question 1
**[Question text]**

A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]

**Answer: [Letter]**
**Explanation:** [Brief explanation]

---

Mix difficulty levels. Test understanding of methodology, results, and key concepts.`,
        },
        mind_map: {
            label: 'Mind Map',
            prompt: `Create a hierarchical mind map of the paper's structure and key concepts. Use this markdown format:

# [Paper Title]

## Core Problem
- Main challenge
  - Sub-aspect 1
  - Sub-aspect 2

## Methodology
- Approach 1
  - Key technique
    - Detail
- Approach 2

## Key Concepts
- Concept 1 → related to → Concept 2
- Concept 3
  - Sub-concept

## Results
- Finding 1
  - Evidence
- Finding 2

## Connections
- How concepts relate across sections

Use indentation to show hierarchy. Keep labels concise.`,
        },
        data_table: {
            label: 'Data Table',
            prompt: `Extract the key data and results from the provided paper(s) into structured tables.

Create tables for:

### Hyperparameters & Settings
| Parameter | Value | Description |
|-----------|-------|-------------|

### Main Results
| Method/Model | Metric 1 | Metric 2 | ... |
|-------------|-----------|-----------|-----|

### Comparison with Baselines
| Approach | Performance | Notes |
|----------|-------------|-------|

### Key Variables & Notation
| Symbol | Meaning | Dimension/Type |
|--------|---------|----------------|

Extract actual numbers from the paper. Mark estimated values with ~.`,
        },
        reading_guide: {
            label: 'Reading Guide',
            prompt: `Create a section-by-section reading guide for the paper. For each major section:

## Section: [Name]

**What this covers:** [1 sentence]
**Why it matters:** [1 sentence]
**Key concepts to understand first:** [prerequisites]
**Reading time estimate:** [x minutes]

### Key Points
1. [Point 1]
2. [Point 2]

### Things to pay attention to
- [Specific figure, equation, or paragraph]

### Common confusions
- [Q&A about tricky parts]

---

Start with a recommended reading order if non-linear reading would help.`,
        },
    };

    function setupStudio() {
        $$('.studio-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.studio-card-edit')) return;
                const op = card.dataset.op;
                if (op && OPERATIONS[op]) {
                    runOperation(op);
                }
            });
        });
    }

    async function runOperation(opType) {
        const op = OPERATIONS[opType];
        if (!op) return;

        const selectedIds = getSelectedSourceIds();
        if (selectedIds.length === 0) {
            alert('Please select at least one source to generate content.');
            return;
        }

        // Add to running operations
        const opId = Date.now().toString(36);
        const opEntry = { id: opId, type: opType, label: op.label, status: 'running', result: '' };
        state.operations.push(opEntry);
        renderOperations();

        // Open modal with loading state
        openResultModal(op.label, '<div class="result-loading"><div class="studio-op-spinner"></div><span>Generating...</span></div>');

        try {
            // Fetch source content for context
            const contents = await Promise.all(
                selectedIds.slice(0, 5).map(async id => {
                    const res = await fetch(`/api/doc/${id}`);
                    const data = await res.json();
                    const textContent = data.content
                        .replace(/<[^>]+>/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim()
                        .slice(0, 6000);
                    return `--- ${data.title} ---\n${textContent}`;
                })
            );
            const context = contents.join('\n\n');

            // Call the studio API
            const res = await fetch('/api/studio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operation: opType,
                    prompt: op.prompt,
                    context,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Operation failed');
            }

            // Stream result
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let fullResult = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.done) break;
                        if (data.content) {
                            fullResult += data.content;
                            updateResultModal(renderMarkdown(fullResult));
                        }
                    } catch { }
                }
            }

            opEntry.status = 'done';
            opEntry.result = fullResult;

        } catch (err) {
            opEntry.status = 'error';
            updateResultModal(`<em style="color: var(--text-warning)">Error: ${escHtml(err.message)}</em>`);
        }

        renderOperations();
    }

    function renderOperations() {
        const container = $('#studio-operations');
        container.innerHTML = state.operations.map(op => `
            <div class="studio-op-item" data-op-id="${op.id}">
                ${op.status === 'running'
                ? '<div class="studio-op-spinner"></div>'
                : op.status === 'done'
                    ? '<svg class="studio-op-check" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
                    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-warning)" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>'
            }
                <div class="studio-op-info">
                    <div class="studio-op-title">${op.status === 'running' ? 'Generating' : ''} ${escHtml(op.label)}${op.status === 'running' ? '...' : ''}</div>
                    <div class="studio-op-meta">based on ${getSelectedSourceIds().length} source${getSelectedSourceIds().length !== 1 ? 's' : ''}</div>
                </div>
            </div>
        `).join('');

        // Click completed operations to re-open
        container.querySelectorAll('.studio-op-item').forEach(item => {
            item.addEventListener('click', () => {
                const opId = item.dataset.opId;
                const op = state.operations.find(o => o.id === opId);
                if (op && op.result) {
                    openResultModal(op.label, renderMarkdown(op.result));
                }
            });
        });
    }

    // ═══════════════════════════════════════════════
    //  Result Modal
    // ═══════════════════════════════════════════════

    function setupResultModal() {
        const overlay = $('#result-overlay');
        const closeBtn = $('#result-modal-close');

        closeBtn.addEventListener('click', closeResultModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeResultModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlay.classList.contains('open')) {
                closeResultModal();
            }
        });
    }

    function openResultModal(title, content) {
        $('#result-modal-title').textContent = title;
        $('#result-modal-body').innerHTML = content;
        $('#result-overlay').classList.add('open');
    }

    function updateResultModal(content) {
        const body = $('#result-modal-body');
        body.innerHTML = content;
        body.scrollTop = body.scrollHeight;
    }

    function closeResultModal() {
        $('#result-overlay').classList.remove('open');
    }

    // ═══════════════════════════════════════════════
    //  Import Modal
    // ═══════════════════════════════════════════════

    function setupImport() {
        const importBtn = $('#btn-import');
        importBtn.addEventListener('click', () => {
            const id = prompt('Enter arXiv ID or URL (e.g. 2301.10226):');
            if (!id) return;

            // Normalize arXiv ID
            let arxivId = id.trim();
            const urlMatch = arxivId.match(/arxiv\.org\/(?:abs|pdf)\/(\d+\.\d+)/);
            if (urlMatch) arxivId = urlMatch[1];

            startImport(arxivId);
        });
    }

    async function startImport(arxivId) {
        try {
            const res = await fetch('/api/import-arxiv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ arxivId }),
            });
            const { jobId } = await res.json();

            // Poll until done
            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await fetch(`/api/import-status/${jobId}`);
                    const status = await statusRes.json();

                    if (status.status === 'done') {
                        clearInterval(pollInterval);
                        await loadSources();
                        generateSuggestions();
                    } else if (status.status === 'error') {
                        clearInterval(pollInterval);
                        alert('Import failed: ' + (status.error || 'Unknown error'));
                    }
                } catch { }
            }, 2000);

        } catch (err) {
            alert('Import failed: ' + err.message);
        }
    }

    // ═══════════════════════════════════════════════
    //  Utilities
    // ═══════════════════════════════════════════════

    function escHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function renderMarkdown(text) {
        // Simple markdown-to-HTML renderer for chat/studio output
        let html = escHtml(text);

        // Headers
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Bold
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Italic
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Code blocks
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

        // Horizontal rules
        html = html.replace(/^---$/gm, '<hr>');

        // Tables (basic)
        html = html.replace(/^\|(.+)\|$/gm, (match) => {
            const cells = match.split('|').filter(c => c.trim());
            if (cells.every(c => /^[\s\-:]+$/.test(c))) {
                return ''; // separator row
            }
            const isHeader = false; // let CSS handle it
            const tag = 'td';
            return '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
        });
        // Wrap consecutive <tr> in <table>
        html = html.replace(/((?:<tr>.*<\/tr>\s*)+)/g, '<table>$1</table>');

        // Unordered lists
        html = html.replace(/^[\s]*[-*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>');

        // Numbered lists
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

        // Paragraphs (lines not already wrapped)
        html = html.replace(/^(?!<[hultopr])((?!<).+)$/gm, '<p>$1</p>');

        // Clean up empty paragraphs
        html = html.replace(/<p>\s*<\/p>/g, '');

        return html;
    }

    // ═══════════════════════════════════════════════
    //  Boot
    // ═══════════════════════════════════════════════

    document.addEventListener('DOMContentLoaded', init);

})();

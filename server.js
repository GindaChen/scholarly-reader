/**
 * Scholarly Reader — Backend Server
 *
 * Serves the HTML reader and handles annotation persistence.
 *
 * Routes:
 *   GET  /                          — serves the reader UI
 *   GET  /api/docs                  — list available documents (.html, .md)
 *   GET  /api/doc/:filename         — read a document from docs/
 *   GET  /api/annotations/:docId    — get annotations for a doc
 *   POST /api/annotations/:docId    — save a new annotation
 *   DELETE /api/annotations/:docId/:id — delete an annotation
 */

require('dotenv').config({ quiet: true });
const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { marked } = require('marked');

const app = express();
app.use(express.json());

// --- Static files ---
app.use(express.static(path.join(__dirname, 'public')));
app.use('/docs', express.static(path.join(__dirname, 'docs')));

// --- Storage ---
const DOCS_DIR = path.join(__dirname, 'docs');
const ANNOTATIONS_DIR = path.join(__dirname, 'data', 'annotations');

fs.mkdirSync(DOCS_DIR, { recursive: true });
fs.mkdirSync(ANNOTATIONS_DIR, { recursive: true });

// --- Helpers ---
function getAnnotationsPath(docId) {
    // Sanitize docId to prevent path traversal
    const safe = docId.replace(/[^a-zA-Z0-9_\-]/g, '_');
    return path.join(ANNOTATIONS_DIR, `${safe}.json`);
}

function loadAnnotations(docId) {
    const p = getAnnotationsPath(docId);
    if (fs.existsSync(p)) {
        try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
        catch { return []; }
    }
    return [];
}

function saveAnnotations(docId, annotations) {
    fs.writeFileSync(getAnnotationsPath(docId), JSON.stringify(annotations, null, 2));
}

// ============================================================
//  Markdown → Annotated HTML Rendering
// ============================================================

// Variable color palette for auto-assignment
const VAR_COLORS = [
    '#f0a050', '#58a6ff', '#56d4dd', '#7ee787', '#ffd700',
    '#d2a8ff', '#ff7b72', '#79c0ff', '#ff9bce', '#a5d6ff',
];

function renderMarkdownDoc(mdContent) {
    // 1. Extract all @var-defs blocks and build variable registry
    const variables = {};
    let colorIdx = 0;
    const varDefsRegex = /<!--\s*@var-defs\s*\n([\s\S]*?)-->/g;
    let match;
    while ((match = varDefsRegex.exec(mdContent)) !== null) {
        const defs = match[1].trim().split('\n');
        for (const line of defs) {
            const colonIdx = line.indexOf(':');
            if (colonIdx === -1) continue;
            const name = line.slice(0, colonIdx).trim();
            const desc = line.slice(colonIdx + 1).trim();
            if (!variables[name]) {
                variables[name] = {
                    desc,
                    color: VAR_COLORS[colorIdx % VAR_COLORS.length],
                };
                colorIdx++;
            }
        }
    }

    // 2. Extract @references block
    const references = {};
    const refBlockRegex = /<!--\s*@references\s*-->\s*\n([\s\S]*?)$/;
    const refMatch = refBlockRegex.exec(mdContent);
    if (refMatch) {
        const refLines = refMatch[1].trim().split('\n');
        for (const line of refLines) {
            const refLineMatch = line.match(/^\[\^(\d+)\]:\s*(.*)/);
            if (!refLineMatch) continue;
            const num = refLineMatch[1];
            const rest = refLineMatch[2];
            const titleM = rest.match(/title="([^"]*)"/);
            const urlM = rest.match(/url="([^"]*)"/);
            const quoteM = rest.match(/quote="([^"]*)"/);
            references[num] = {
                title: titleM ? titleM[1] : `Reference ${num}`,
                url: urlM ? urlM[1] : '',
                quote: quoteM ? quoteM[1] : '',
            };
        }
        // Remove references block from content
        mdContent = mdContent.replace(refBlockRegex, '');
    }

    // 3. Remove @var-region and @var-defs comments
    mdContent = mdContent.replace(/<!--\s*@var-region\s*-->/g, '');
    mdContent = mdContent.replace(/<!--\s*@var-defs\s*\n[\s\S]*?-->/g, '');

    // 4. Convert footnote refs [^N] → ref-badge HTML placeholders
    for (const num of Object.keys(references)) {
        const ref = references[num];
        const badgeHtml = `<sup class="ref-badge" data-ref="${num}" data-title="${escHtml(ref.title)}" data-url="${escHtml(ref.url)}" data-quote="${escHtml(ref.quote)}">${num}</sup>`;
        // Replace all [^N] occurrences (not inside code blocks)
        mdContent = mdContent.replace(new RegExp(`\\[\\^${num}\\]`, 'g'), badgeHtml);
    }

    // 5. Extract and protect math blocks so Marked doesn't parse underscores
    const mathBlocks = [];
    mdContent = mdContent.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
        const id = `__MATH_DISP_${mathBlocks.length}__`;
        mathBlocks.push({ id, type: 'display', raw: math.trim() });
        return id;
    });
    mdContent = mdContent.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
        const id = `__MATH_INL_${mathBlocks.length}__`;
        mathBlocks.push({ id, type: 'inline', raw: math.trim() });
        return id;
    });

    // 6. Configure and run marked
    marked.setOptions({
        gfm: true,
        breaks: false,
        headerIds: true,
        mangle: false,
    });
    let html = marked.parse(mdContent);

    // 7. Restore math blocks as HTML
    mathBlocks.forEach(b => {
        const rawHtml = escHtml(b.raw);
        if (b.type === 'display') {
            html = html.replace(b.id, `<div class="math-display" data-raw="${rawHtml}"><span class="m-eq">${rawHtml}</span><div class="math-raw-view hidden">${rawHtml}</div></div>`);
        } else {
            html = html.replace(b.id, `<span class="math-inline" data-raw="${rawHtml}">${rawHtml}<span class="math-raw-view hidden">${rawHtml}</span></span>`);
        }
    });

    // 8. Post-process: wrap known variable names in <span class="var">
    // Sort by length descending so longer names get matched first
    const sortedVarNames = Object.keys(variables).sort((a, b) => b.length - a.length);
    for (const name of sortedVarNames) {
        const v = variables[name];
        // Escape for regex — match whole word boundaries
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Only wrap in text content, avoid matching inside HTML tags or already-wrapped vars
        const varHtml = `<span class="var" data-var="${escHtml(name)}" data-desc="${escHtml(v.desc)}" style="--var-color: ${v.color}">${name}</span>`;
        // Use word boundary matching, skip matches inside tags
        html = html.replace(new RegExp(`(?<![\\w">])${escaped}(?![\\w<])`, 'g'), varHtml);
    }

    return html;
}

function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ============================================================
//  Routes
// ============================================================

// List available documents (folder-based with metadata.yaml)
app.get('/api/docs', (req, res) => {
    const yaml = require('js-yaml');
    try {
        const entries = fs.readdirSync(DOCS_DIR, { withFileTypes: true });
        const docs = [];

        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

            const metaPath = path.join(DOCS_DIR, entry.name, 'metadata.yaml');
            if (!fs.existsSync(metaPath)) continue;

            try {
                const meta = yaml.load(fs.readFileSync(metaPath, 'utf-8'));
                const primaryFile = (meta.files || []).find(f => f.primary) || (meta.files || [])[0];
                const docId = entry.name;

                docs.push({
                    id: docId,
                    title: meta.title || docId,
                    short_title: meta.short_title || meta.title || docId,
                    type: meta.type || 'unknown',
                    authors: (meta.authors || []).map(a => `${a.given} ${a.family}`).join(', '),
                    year: meta.year || null,
                    conference: meta.conference || null,
                    venue: meta.venue || null,
                    arxiv_id: meta.arxiv_id || null,
                    url: meta.url || null,
                    doi: meta.doi || null,
                    tags: meta.tags || [],
                    abstract: meta.abstract || '',
                    source: meta.source || 'manual',
                    pinned: !!meta.pinned,
                    variable_count: meta.variable_count || 0,
                    equation_count: meta.equation_count || 0,
                    reference_count: meta.reference_count || 0,
                    primary_file: primaryFile ? primaryFile.name : null,
                    primary_format: primaryFile ? primaryFile.format : null,
                    files: (meta.files || []).map(f => ({ name: f.name, format: f.format, description: f.description })),
                });
            } catch (e) {
                console.warn(`  ⚠️  Skipping ${entry.name}: ${e.message}`);
            }
        }

        // Sort: pinned first, then by year desc, then title
        docs.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.year || 0) - (a.year || 0) || (a.title || '').localeCompare(b.title || ''));
        res.json(docs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get document metadata
app.get('/api/doc-metadata/:id', (req, res) => {
    const yaml = require('js-yaml');
    const docDir = path.join(DOCS_DIR, req.params.id);
    const metaPath = path.join(docDir, 'metadata.yaml');
    if (!fs.existsSync(metaPath)) return res.status(404).json({ error: 'Document not found' });
    try {
        const meta = yaml.load(fs.readFileSync(metaPath, 'utf-8'));
        res.json(meta);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update document metadata (short_title, pinned)
app.patch('/api/doc-metadata/:id', (req, res) => {
    const yaml = require('js-yaml');
    const id = req.params.id;
    if (id.includes('..')) return res.status(400).json({ error: 'Invalid id' });

    const metaPath = path.join(DOCS_DIR, id, 'metadata.yaml');
    if (!fs.existsSync(metaPath)) return res.status(404).json({ error: 'Document not found' });

    try {
        const raw = fs.readFileSync(metaPath, 'utf-8');
        const meta = yaml.load(raw);

        if (req.body.short_title !== undefined) {
            meta.short_title = req.body.short_title;
        }
        if (req.body.pinned !== undefined) {
            meta.pinned = !!req.body.pinned;
        }

        fs.writeFileSync(metaPath, yaml.dump(meta, { lineWidth: -1, noRefs: true }));
        res.json({ ok: true, short_title: meta.short_title, pinned: meta.pinned });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Strip full HTML documents to body-content fragments
// Agent-generated paper.html files may be full <!DOCTYPE> documents — the reader
// only needs the body content since it injects into #article.
function stripToFragment(html) {
    if (!html || !html.includes('<!DOCTYPE') && !html.includes('<html')) return html;
    // Extract <body> content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch) return bodyMatch[1].trim();
    // Fallback: strip head/style/html/doctype tags
    return html
        .replace(/<!DOCTYPE[^>]*>/gi, '')
        .replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '')
        .replace(/<head>[\s\S]*?<\/head>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<body[^>]*>/gi, '').replace(/<\/body>/gi, '')
        .trim();
}

// Read a document (folder-based: docs/{id}/{file})
app.get('/api/doc/:id', (req, res) => {
    const yaml = require('js-yaml');
    const { id } = req.params;
    const fileOverride = req.query.file; // optional: ?file=paper.md

    if (id.includes('..')) return res.status(400).json({ error: 'Invalid id' });

    const docDir = path.join(DOCS_DIR, id);
    const metaPath = path.join(docDir, 'metadata.yaml');

    if (!fs.existsSync(metaPath)) {
        return res.status(404).json({ error: 'Document not found' });
    }

    try {
        const meta = yaml.load(fs.readFileSync(metaPath, 'utf-8'));
        const files = meta.files || [];

        // Determine which file to serve
        let targetFile;
        if (fileOverride) {
            targetFile = files.find(f => f.name === fileOverride);
        }
        if (!targetFile) {
            targetFile = files.find(f => f.primary) || files[0];
        }

        if (!targetFile) {
            return res.status(404).json({ error: 'No files in this document' });
        }

        const filepath = path.join(docDir, targetFile.name);
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: `File not found: ${targetFile.name}` });
        }

        let content = fs.readFileSync(filepath, 'utf-8');

        // Rewrite relative figure paths to absolute paths for serving
        content = content.replace(/\.\/figures\//g, `/docs/${id}/figures/`);

        // Convert based on format
        if (targetFile.format === 'markdown' || targetFile.name.endsWith('.md')) {
            content = renderMarkdownDoc(content);
        } else if (targetFile.format === 'tex' || targetFile.name.endsWith('.tex')) {
            try {
                const { convertTexToHtml } = require('./tex2html');
                content = convertTexToHtml(filepath);
            } catch (e) {
                return res.status(500).json({ error: 'TeX conversion failed: ' + e.message });
            }
        }

        res.json({
            id,
            filename: targetFile.name,
            format: targetFile.format,
            title: meta.title,
            url: meta.url || '',
            pdf: meta.pdf || '',
            arxiv_id: meta.arxiv_id || '',
            content: stripToFragment(content),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get annotations
app.get('/api/annotations/:docId', (req, res) => {
    res.json(loadAnnotations(req.params.docId));
});

// Add annotation
app.post('/api/annotations/:docId', (req, res) => {
    const { docId } = req.params;
    const { type, selectedText, note, color, replacementText, anchorSelector, anchorOffset } = req.body;

    if (!type && !note && !selectedText) {
        return res.status(400).json({ error: 'type, note or selectedText required' });
    }

    const annotations = loadAnnotations(docId);
    const annotation = {
        id: uuidv4().slice(0, 8),
        type: type || 'note',
        selectedText: selectedText || '',
        note: note || '',
        color: color || '',
        replacementText: replacementText || '',
        anchorSelector: anchorSelector || '',
        anchorOffset: anchorOffset || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    annotations.push(annotation);
    saveAnnotations(docId, annotations);
    res.json(annotation);
});

// Update annotation
app.put('/api/annotations/:docId/:id', (req, res) => {
    const { docId, id } = req.params;
    const { note, color, replacementText, type, selectedText, anchorSelector, anchorOffset } = req.body;
    const annotations = loadAnnotations(docId);
    const idx = annotations.findIndex(a => a.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Annotation not found' });

    if (note !== undefined) annotations[idx].note = note;
    if (color !== undefined) annotations[idx].color = color;
    if (replacementText !== undefined) annotations[idx].replacementText = replacementText;
    if (type !== undefined) annotations[idx].type = type;
    if (selectedText !== undefined) annotations[idx].selectedText = selectedText;
    if (anchorSelector !== undefined) annotations[idx].anchorSelector = anchorSelector;
    if (anchorOffset !== undefined) annotations[idx].anchorOffset = anchorOffset;

    annotations[idx].updatedAt = new Date().toISOString();
    saveAnnotations(docId, annotations);
    res.json(annotations[idx]);
});

// Bulk replace all annotations (used for jumping history branches)
app.put('/api/annotations/:docId/all', (req, res) => {
    const { docId } = req.params;
    const { annotations } = req.body;
    if (!Array.isArray(annotations)) {
        return res.status(400).json({ error: 'annotations must be an array' });
    }
    saveAnnotations(docId, annotations);
    res.json({ ok: true, count: annotations.length });
});

// Delete annotation
app.delete('/api/annotations/:docId/:id', (req, res) => {
    const { docId, id } = req.params;
    let annotations = loadAnnotations(docId);
    annotations = annotations.filter(a => a.id !== id);
    saveAnnotations(docId, annotations);
    res.json({ ok: true });
});

// --- Start ---
const PORT = process.env.SCHOLARLY_PORT || 3003;

// ─── ArXiv Import Pipeline ──────────────────────────────────

const importJobs = new Map(); // id → { status, progress, result, error }

app.post('/api/import-arxiv', async (req, res) => {
    const { arxivId, legacy } = req.body;
    if (!arxivId) return res.status(400).json({ error: 'arxivId required' });

    const jobId = uuidv4().slice(0, 8);
    importJobs.set(jobId, { status: 'running', progress: 'Starting...', result: null, error: null });

    res.json({ jobId, status: 'running' });

    // Run pipeline asynchronously
    try {
        if (legacy) {
            // Legacy static pipeline
            const { importArxiv } = require('./arxiv-pipeline');
            const result = await importArxiv(arxivId, (msg) => {
                const job = importJobs.get(jobId);
                if (job) job.progress = msg;
            });
            const job = importJobs.get(jobId);
            if (job) { job.status = 'done'; job.result = result; }
        } else {
            // LLM-native agent pipeline
            try {
                const { importPaperWithAgent } = await import('./agents/import-agent/index.mjs');
                const result = await importPaperWithAgent(arxivId, (msg) => {
                    const job = importJobs.get(jobId);
                    if (job) job.progress = msg;
                });
                const job = importJobs.get(jobId);
                if (job) { job.status = 'done'; job.result = result; }
            } catch (agentErr) {
                // Fall back to legacy pipeline if agent fails (e.g. no API key)
                console.warn('[import] Agent failed, falling back to legacy pipeline:', agentErr.message);
                const { importArxiv } = require('./arxiv-pipeline');
                const result = await importArxiv(arxivId, (msg) => {
                    const job = importJobs.get(jobId);
                    if (job) job.progress = msg;
                });
                const job = importJobs.get(jobId);
                if (job) { job.status = 'done'; job.result = result; }
            }
        }
    } catch (err) {
        const job = importJobs.get(jobId);
        if (job) { job.status = 'error'; job.error = err.message; }
    }
});

app.get('/api/paper-search', async (req, res) => {
    const { title } = req.query;
    if (!title) return res.status(400).json({ error: 'title required' });

    const results = [];

    // 1. arXiv exact title search
    try {
        const encoded = encodeURIComponent(`"${title}"`);
        const xml = await fetch(`https://export.arxiv.org/api/query?search_query=ti:${encoded}&max_results=2`).then(r => r.text());
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let m;
        while ((m = entryRegex.exec(xml)) !== null) {
            const entry = m[1];
            const idMatch = entry.match(/<id>http:\/\/arxiv\.org\/abs\/([\w.]+)<\/id>/);
            const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
            if (idMatch && titleMatch) {
                results.push({
                    source: 'arxiv',
                    arxivId: idMatch[1].split('v')[0],
                    title: titleMatch[1].replace(/\s+/g, ' ').trim(),
                    url: `https://arxiv.org/abs/${idMatch[1]}`,
                    pdfUrl: `https://arxiv.org/pdf/${idMatch[1]}`,
                });
            }
        }
    } catch (e) { /* ignore */ }

    // 2. Semantic Scholar (if arXiv found nothing useful)
    if (results.length === 0) {
        try {
            const ssUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&fields=title,externalIds,openAccessPdf,year&limit=3`;
            const data = await fetch(ssUrl, { headers: { 'User-Agent': 'scholarly-reader/1.0' } }).then(r => r.json());
            (data.data || []).forEach(paper => {
                const arxivId = paper.externalIds?.ArXiv;
                const pdfUrl = paper.openAccessPdf?.url || null;
                results.push({
                    source: arxivId ? 'arxiv' : 'semantic-scholar',
                    arxivId: arxivId || null,
                    title: paper.title,
                    url: arxivId ? `https://arxiv.org/abs/${arxivId}` : (pdfUrl || ''),
                    pdfUrl,
                    year: paper.year,
                    paperId: paper.paperId,
                });
            });
        } catch (e) { /* ignore */ }
    }

    // 3. CrossRef (last resort — provides DOI + metadata but rarely a PDF)
    if (results.length === 0) {
        try {
            const crUrl = `https://api.crossref.org/works?query.title=${encodeURIComponent(title)}&rows=2&select=title,DOI,URL,link`;
            const data = await fetch(crUrl).then(r => r.json());
            (data.message?.items || []).forEach(item => {
                const t = (item.title || [])[0] || title;
                const pdfLink = (item.link || []).find(l => l['content-type'] === 'application/pdf');
                results.push({
                    source: 'crossref',
                    arxivId: null,
                    title: t,
                    url: item.URL || `https://doi.org/${item.DOI}`,
                    pdfUrl: pdfLink?.URL || null,
                    doi: item.DOI,
                });
            });
        } catch (e) { /* ignore */ }
    }

    res.json({ results });
});

app.get('/api/arxiv-search', async (req, res) => {
    const { title } = req.query;
    if (!title) return res.status(400).json({ error: 'title required' });
    try {
        const encoded = encodeURIComponent(`"${title}"`);
        const url = `https://export.arxiv.org/api/query?search_query=ti:${encoded}&max_results=3`;
        const response = await fetch(url);
        const xml = await response.text();
        // Parse entries from Atom XML
        const entries = [];
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let m;
        while ((m = entryRegex.exec(xml)) !== null) {
            const entry = m[1];
            const idMatch = entry.match(/<id>http:\/\/arxiv\.org\/abs\/([\w.]+)<\/id>/);
            const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
            if (idMatch && titleMatch) {
                entries.push({
                    arxivId: idMatch[1].replace('v\d+$', '').split('v')[0],
                    title: titleMatch[1].replace(/\s+/g, ' ').trim(),
                });
            }
        }
        res.json({ results: entries });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/import-status/:jobId', (req, res) => {
    const job = importJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
});

// ─── AI Chat ────────────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
    const { question, context, docId } = req.body;
    if (!question) return res.status(400).json({ error: 'question required' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'No OPENAI_API_KEY configured. Add it to .env file.' });
    }

    try {
        const OpenAI = require('openai');
        const openai = new OpenAI({ apiKey });
        const model = process.env.OPENAI_MODEL || 'gpt-4o';

        // Set up SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const systemMsg = `You are a helpful assistant for the Scholarly Reader application. You help users understand academic papers. Be concise and precise. Use LaTeX notation when referencing math (e.g., $d_k$, $\\text{softmax}$).`;

        const messages = [
            { role: 'system', content: systemMsg },
        ];

        if (context) {
            messages.push({ role: 'user', content: `Here is the relevant passage from the paper:\n\n${context}` });
            messages.push({ role: 'assistant', content: 'I\'ve read the passage. What would you like to know?' });
        }

        messages.push({ role: 'user', content: question });

        const stream = await openai.chat.completions.create({
            model,
            messages,
            stream: true,
            max_tokens: 1024,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
        }

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
    } catch (err) {
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        } else {
            res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
            res.end();
        }
    }
});

if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`📖 Scholarly Reader on http://localhost:${PORT}`);
        const yaml = require('js-yaml');
        const folders = fs.readdirSync(DOCS_DIR, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.'))
            .filter(d => fs.existsSync(path.join(DOCS_DIR, d.name, 'metadata.yaml')));
        console.log(`   Documents available: ${folders.length}`);
        folders.forEach(d => {
            try {
                const meta = yaml.load(fs.readFileSync(path.join(DOCS_DIR, d.name, 'metadata.yaml'), 'utf-8'));
                console.log(`   • ${meta.short_title || meta.title} (${d.name}/)`);
            } catch { console.log(`   • ${d.name}/`); }
        });
        if (process.env.OPENAI_API_KEY) {
            console.log(`   🤖 AI features enabled (OpenAI)`);
        } else {
            console.log(`   ⚠️  No OPENAI_API_KEY — AI features disabled (set in .env)`);
        }
    });
}

module.exports = app;

/**
 * arxiv-pipeline.js — Download arXiv TeX source → Fully rendered document
 *
 * Pipeline v2 stages:
 *   1. Download & extract arXiv e-print source
 *   2. Parse TeX (resolve \input, extract structure)
 *   3. Process with tools: figures, math, tables, cross-refs
 *   4. LLM annotation (if API key available)
 *   5. Assemble into doc folder with metadata.yaml + rendered HTML
 *
 * Usage:
 *   node arxiv-pipeline.js 1706.03762
 *   const { importArxiv } = require('./arxiv-pipeline'); await importArxiv('1706.03762');
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

const DOCS_DIR = path.join(__dirname, 'docs');
const TEMP_DIR = path.join(__dirname, 'docs', '.arxiv-tmp');
const PROMPT_PATH = path.join(__dirname, 'prompts', 'annotate-section.md');

// Import tools
const { renderAllMath, setCustomMacros, extractKatexMacros } = require('./tools/render-math');
const { extractFigures, replaceFiguresInText } = require('./tools/extract-figures');
const { convertTables } = require('./tools/convert-tables');
const { collectLabels, resolveRefs } = require('./tools/resolve-refs');

// ─── Stage 1: Download ──────────────────────────────────────

async function downloadArxivSource(arxivId) {
    const cleanId = arxivId.replace('https://arxiv.org/abs/', '').replace('https://arxiv.org/pdf/', '').trim();
    const tmpDir = path.join(TEMP_DIR, cleanId);

    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    const tarPath = path.join(tmpDir, `${cleanId}.tar.gz`);
    const url = `https://arxiv.org/e-print/${cleanId}`;

    console.log(`[1/5] Downloading arXiv source: ${url}`);
    execSync(`curl -L -s -o "${tarPath}" "${url}"`, { timeout: 60000 });

    if (!fs.existsSync(tarPath) || fs.statSync(tarPath).size < 100) {
        throw new Error(`Failed to download arXiv source for ${cleanId}`);
    }

    console.log(`[1/5] Extracting...`);
    execSync(`tar xzf "${tarPath}" -C "${tmpDir}" 2>/dev/null || true`, { timeout: 30000 });

    return { cleanId, tmpDir };
}

// ─── Stage 2: Parse TeX Structure ───────────────────────────

function findMainTexFile(dir) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.tex'));
    for (const f of files) {
        const content = fs.readFileSync(path.join(dir, f), 'utf-8');
        if (content.includes('\\documentclass') || content.includes('\\begin{document}')) {
            return path.join(dir, f);
        }
    }
    if (files.length > 0) {
        files.sort((a, b) => fs.statSync(path.join(dir, b)).size - fs.statSync(path.join(dir, a)).size);
        return path.join(dir, files[0]);
    }
    throw new Error('No .tex file found in arXiv source');
}

function resolveInputs(filePath, baseDir) {
    let content = fs.readFileSync(filePath, 'utf-8');
    content = content.replace(/\\input\{([^}]+)\}/g, (_, filename) => {
        let inputPath = path.join(baseDir, filename);
        if (!inputPath.endsWith('.tex')) inputPath += '.tex';
        try {
            return resolveInputs(inputPath, baseDir);
        } catch {
            return `% Could not resolve \\input{${filename}}`;
        }
    });
    return content;
}

function extractBracedContent(tex, cmd) {
    // Find \cmd{ and extract content handling nested braces + optional [...]
    const re = new RegExp('\\\\' + cmd + '(?:\\[[^\\]]*\\])?\\{');
    const match = re.exec(tex);
    if (!match) return null;
    let depth = 1, i = match.index + match[0].length, result = '';
    while (i < tex.length && depth > 0) {
        if (tex[i] === '{') depth++;
        else if (tex[i] === '}') { depth--; if (depth === 0) break; }
        result += tex[i++];
    }
    return result.replace(/\\\\/, ' ').replace(/\s+/g, ' ').trim() || null;
}

function extractMetadata(fullTex) {
    const rawTitle = extractBracedContent(fullTex, 'title');
    const title = rawTitle ? rawTitle.replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '').trim() : 'Untitled Paper';

    const authorMatch = fullTex.match(/\\author\{([\s\S]*?)\}/);
    let authors = [];
    if (authorMatch) {
        const raw = authorMatch[1]
            .replace(/\\thanks\{[^}]*\}/g, '')
            .replace(/\\footnotemark\[\d+\]/g, '')
            .replace(/\\And|\\AND/g, ', ')
            .replace(/\\texttt\{[^}]*\}/g, '')
            .replace(/\\\\/g, '')
            .replace(/\\text\{[^}]*\}/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        authors = raw.split(',')
            .map(a => a.trim())
            .filter(a => a && !a.includes('@') && !a.includes('{') && a.length > 2);
    }

    const abstractMatch = fullTex.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);
    const abstract = abstractMatch ? abstractMatch[1].replace(/(?<!\\)%.*$/gm, '').trim() : '';

    return { title, authors, abstract };
}

function extractSections(body) {
    const sections = [];
    const sectionPattern = /\\section\*?\{([^}]+)\}/g;
    const sectionStarts = [];
    let m;
    while ((m = sectionPattern.exec(body)) !== null) {
        sectionStarts.push({ title: m[1], index: m.index, fullMatch: m[0] });
    }

    for (let i = 0; i < sectionStarts.length; i++) {
        const start = sectionStarts[i].index + sectionStarts[i].fullMatch.length;
        const end = i + 1 < sectionStarts.length ? sectionStarts[i + 1].index : body.length;
        sections.push({
            title: sectionStarts[i].title,
            content: body.substring(start, end).trim(),
            number: i + 1,
        });
    }

    return sections;
}

// ─── Citation normalization ─────────────────────────────────

/**
 * Normalize various citation patterns to \cite{key} BEFORE any other processing.
 * Handles: \mbox{\cite{key}}, \mbox{[key]}, ~\mbox{[key]}, ~[key], \citep{}, \citet{}
 */
function normalizeCitations(tex) {
    // \mbox{\cite{key}} → \cite{key}  (unwrap mbox around cite)
    tex = tex.replace(/\\mbox\{(\\cite[pt]?\{[^}]+\})\}/g, '$1');

    // ~\mbox{[key]} → \cite{key}
    tex = tex.replace(/~?\\mbox\{\[([^\]]+)\]\}/g, (_, key) => {
        return '\\cite{' + key + '}';
    });

    // ~[key] → \cite{key} (but not inside math or existing commands)
    // Be careful: only match ~ followed by [key] where key looks like a citation key
    tex = tex.replace(/~\[([A-Za-z][A-Za-z0-9_:.-]*(?:,\s*[A-Za-z][A-Za-z0-9_:.-]*)*)\]/g, (_, keys) => {
        return '\\cite{' + keys + '}';
    });

    return tex;
}

// ─── Stage 3: Process with tools ────────────────────────────

function processSection(content) {
    let result = content;

    // Strip LaTeX comments
    result = result.replace(/(?<!\\)%.*$/gm, '');

    // Convert subsections to HTML headings
    result = result.replace(/\\subsection\*?\{([^}]+)\}/g, '<h3>$1</h3>');
    result = result.replace(/\\subsubsection\*?\{([^}]+)\}/g, '<h4>$1</h4>');

    // Convert formatting
    result = result.replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>');
    result = result.replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>');
    result = result.replace(/\\emph\{([^}]+)\}/g, '<em>$1</em>');
    result = result.replace(/\\url\{([^}]+)\}/g, '[$1]($1)');
    result = result.replace(/\\paragraph\{([^}]+)\}/g, '**$1.**');
    result = result.replace(/~(?!\\)/g, ' ');
    result = result.replace(/\\footnote\{([^}]*)\}/g, '');

    // Convert lists
    result = result.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, items) => {
        return items.split('\\item').filter(s => s.trim()).map(item => `- ${item.trim()}`).join('\n');
    });
    result = result.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_, items) => {
        let n = 0;
        return items.split('\\item').filter(s => s.trim()).map(item => `${++n}. ${item.trim()}`).join('\n');
    });

    // Unwrap remaining \mbox{text} (non-citation uses, e.g. cross-refs)
    result = result.replace(/\\mbox\{([^}]*)\}/g, '$1');

    // Convert citations: \cite{key}, \citep{key}, \citet{key} → [key]
    result = result.replace(/\\cite[pt]?\{([^}]+)\}/g, (_, keys) => {
        return keys.split(',').map(k => `[${k.trim()}]`).join('');
    });

    return result;
}

// ─── Stage 4: LLM Annotation ───────────────────────────────

async function annotateWithLLM(sections, bibliography, onProgress) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.warn('[4/5] No OPENAI_API_KEY — using mechanical + tool-enhanced conversion');
        return null;
    }

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || 'gpt-4o';
    const systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');

    const annotatedSections = [];

    for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        if (onProgress) onProgress(`Annotating section ${i + 1}/${sections.length}: ${sec.title}`);
        console.log(`[4/5] LLM annotating: ${sec.number}. ${sec.title}`);

        const userPrompt = `Convert this LaTeX section to annotated Markdown.

## Section: ${sec.number}. ${sec.title}

### Raw LaTeX:
\`\`\`latex
${sec.content}
\`\`\`

### Bibliography (for citation resolution):
\`\`\`latex
${bibliography.substring(0, 4000)}
\`\`\`

Output ONLY the Markdown — no code fences, no explanation. Start with the ## heading.`;

        try {
            const response = await openai.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.1,
                max_tokens: 4096,
            });

            annotatedSections.push(response.choices[0].message.content.trim());
        } catch (err) {
            console.error(`[4/5] LLM error on section ${sec.title}: ${err.message}`);
            annotatedSections.push(null);
        }
    }

    return annotatedSections;
}

// ─── Stage 5: Assemble ──────────────────────────────────────

function assembleHtml(meta, sections, figures, bibliography, outputDir) {
    let html = '';

    // Title + metadata
    html += `<h1>${escapeHtml(meta.title)}</h1>\n\n`;
    html += `<p class="authors">${meta.authors.join(', ')}</p>\n\n`;

    // Abstract
    if (meta.abstract) {
        let abs = meta.abstract;
        abs = abs.replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>');
        abs = abs.replace(/\\emph\{([^}]+)\}/g, '<em>$1</em>');
        abs = abs.replace(/~(?!\\)/g, ' ');
        html += `<h2>Abstract</h2>\n<p>${abs}</p>\n\n<hr>\n\n`;
    }

    // Sections
    for (const sec of sections) {
        html += `<h2>${sec.number}. ${escapeHtml(sec.title)}</h2>\n\n`;
        html += sec.html + '\n\n<hr>\n\n';
    }

    // References from bibliography
    if (bibliography.length > 0) {
        html += '<h2>References</h2>\n<ol class="references">\n';
        bibliography.forEach((ref, i) => {
            const num = i + 1;
            html += `  <li id="ref-${num}"><strong>${ref.authors}</strong> ${ref.title}. <em>${ref.venue}</em></li>\n`;
        });
        html += '</ol>\n';
    }

    // Final pass: convert any surviving markdown syntax to HTML
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    return html;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Extract bibliography entries from \begin{thebibliography}...\end{thebibliography}
 */
function extractBibliography(bibTex) {
    const refs = [];
    const items = bibTex.split('\\bibitem');

    for (let i = 1; i < items.length; i++) {
        let item = items[i].trim();
        // Handle \bibitem[label]{key} or \bibitem{key}
        let key;
        if (item.startsWith('[')) {
            const closeBracket = item.indexOf(']');
            item = item.substring(closeBracket + 1).trim();
        }
        if (item.startsWith('{')) {
            const closeBrace = item.indexOf('}');
            key = item.substring(1, closeBrace);
            item = item.substring(closeBrace + 1).trim();
        } else {
            continue;
        }

        let content = item;
        // Clean up newblock
        content = content.replace(/\\newblock\s*/g, '');
        // Remove LaTeX formatting
        content = content.replace(/\\emph\{([^}]+)\}/g, '$1');
        content = content.replace(/\\textit\{([^}]+)\}/g, '$1');
        content = content.replace(/\\textbf\{([^}]+)\}/g, '$1');
        content = content.replace(/\{\\em\s+([^}]+)\}/g, '$1');
        content = content.replace(/\\url\{([^}]+)\}/g, '$1');
        content = content.replace(/[{}]/g, '');
        content = content.replace(/~(?!\\)/g, ' ');

        // Try to extract arxiv ID
        const arxivMatch = content.match(/arxiv[:\s/]*([0-9]{4}\.[0-9]{4,5})/i);

        // Extract parts — split on periods followed by newlines or double spaces
        const parts = content.split('\n').map(l => l.trim()).filter(l => l);
        const authors = parts[0] || '';
        const title = parts[1] || '';
        const venue = parts.slice(2).join(' ');

        refs.push({ key, authors, title, venue, arxivId: arxivMatch ? arxivMatch[1] : '' });
    }

    return refs;
}

// ─── Main Pipeline ──────────────────────────────────────────

async function importArxiv(arxivId, onProgress) {
    const progress = onProgress || ((msg) => console.log(`  → ${msg}`));

    // Stage 1: Download
    progress('Downloading arXiv source...');
    const { cleanId, tmpDir } = await downloadArxivSource(arxivId);

    // Stage 2: Parse
    progress('Parsing TeX structure...');
    const mainFile = findMainTexFile(tmpDir);
    let fullTex = resolveInputs(mainFile, tmpDir);

    // Detect PDF-only submissions (TeX just embeds a PDF, no real content)
    const isPdfOnly = !fullTex.includes('\\section') && !fullTex.includes('\\begin{abstract}')
        && (fullTex.includes('\\includepdf') || (fullTex.includes('\\includegraphics') && /\.pdf/.test(fullTex)));

    if (isPdfOnly) {
        progress('PDF-only submission detected — fetching metadata from arXiv API…');
        let apiTitle = 'Untitled Paper', apiAbstract = '', apiAuthors = [];
        try {
            const xml = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(cleanId)}`).then(r => r.text());
            const tMatch = xml.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/);
            const aMatch = xml.match(/<summary>([\s\S]*?)<\/summary>/);
            const authMatches = [...xml.matchAll(/<name>([\s\S]*?)<\/name>/g)];
            if (tMatch) apiTitle = tMatch[1].replace(/\s+/g, ' ').trim();
            if (aMatch) apiAbstract = aMatch[1].replace(/\s+/g, ' ').trim();
            apiAuthors = authMatches.map(m => m[1].trim());
        } catch (e) { /* ignore */ }

        const pdfUrl = `https://arxiv.org/pdf/${cleanId}`;
        const html = `<h1>${escapeHtml(apiTitle)}</h1>
<p class="authors">${escapeHtml(apiAuthors.join(', '))}</p>
<h2>Abstract</h2>
<p>${escapeHtml(apiAbstract)}</p>
<div style="margin-top:1.5rem;">
  <p style="color:var(--text-muted,#888);font-size:13px;margin-bottom:0.5rem;">
    ⚠️ This paper was submitted as a PDF without TeX source. Displaying embedded PDF.
  </p>
  <iframe src="${pdfUrl}" style="width:100%;height:80vh;border:none;border-radius:6px;" title="${escapeHtml(apiTitle)}"></iframe>
</div>`;

        const outDir = path.join(DOCS_DIR, cleanId.replace('.', '-'));
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, 'paper.html'), html);

        const short = apiTitle.length > 40 ? apiTitle.substring(0, 40) + '…' : apiTitle;
        const metadata = {
            title: apiTitle, short_title: short, type: 'journal-article',
            authors: apiAuthors, date: new Date().toISOString().split('T')[0],
            url: `https://arxiv.org/abs/${cleanId}`,
            pdf: pdfUrl, arxiv_id: cleanId,
            archive: 'arxiv', archive_url: `https://arxiv.org/abs/${cleanId}`,
            source: 'arxiv-pipeline', pipeline_version: '2.2',
            tags: ['auto-imported', 'arxiv-pipeline', 'pdf-only'],
            abstract: apiAbstract,
            files: [{ name: 'paper.html', format: 'html', description: 'PDF embed fallback', primary: true }],
        };
        const yaml = require('js-yaml');
        fs.writeFileSync(path.join(outDir, 'metadata.yaml'), yaml.dump(metadata));
        progress(`✅ PDF-only paper saved: ${apiTitle}`);
        return { title: apiTitle, docId: cleanId.replace('.', '-'), docDir: outDir };
    }

    // Also resolve .bbl file (compiled bibliography) — inline it so extractBibliography works
    const bblFiles = fs.readdirSync(tmpDir).filter(f => f.endsWith('.bbl'));
    for (const bblFile of bblFiles) {
        const bblContent = fs.readFileSync(path.join(tmpDir, bblFile), 'utf-8');
        // If the tex has \bibliography{...} but no \begin{thebibliography}, append .bbl content
        if (!fullTex.includes('\\begin{thebibliography}') && bblContent.includes('\\begin{thebibliography}')) {
            // Insert before \end{document} or append
            const endDocIdx = fullTex.lastIndexOf('\\end{document}');
            if (endDocIdx !== -1) {
                fullTex = fullTex.substring(0, endDocIdx) + '\n' + bblContent + '\n' + fullTex.substring(endDocIdx);
            } else {
                fullTex += '\n' + bblContent;
            }
            console.log('[2/5] Inlined .bbl file: ' + bblFile);
        }
    }

    const docMatch = fullTex.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
    const body = docMatch ? docMatch[1] : fullTex;

    let meta = extractMetadata(fullTex);

    // Fallback: fetch title from arXiv API if extraction yielded nothing
    if (meta.title === 'Untitled Paper') {
        try {
            const xml = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(cleanId)}`).then(r => r.text());
            const titleMatch = xml.match(/<entry>[\s\S]*?<title>([\s\S]*?)<\/title>/);
            if (titleMatch) meta.title = titleMatch[1].replace(/\s+/g, ' ').trim();
        } catch (e) { /* ignore — keep Untitled */ }
        progress(`Title: ${meta.title}`);
    }

    const sections = extractSections(body);
    const bibMatch = body.match(/\\begin\{thebibliography\}[\s\S]*?\\end\{thebibliography\}/);
    const bibRaw = bibMatch ? bibMatch[0] : '';
    const bibliography = bibRaw ? extractBibliography(bibRaw) : [];

    console.log(`[2/5] Found ${sections.length} sections: ${sections.map(s => s.title).join(', ')}`);
    console.log(`[2/5] Found ${bibliography.length} bibliography entries`);

    // Extract custom macros from preamble and set them for KaTeX
    const preamble = fullTex.match(/([\s\S]*?)\\begin\{document\}/);
    const preambleText = preamble ? preamble[1] : '';
    const katexMacros = extractKatexMacros(preambleText);
    setCustomMacros(katexMacros);
    console.log(`[2/5] Extracted ${Object.keys(katexMacros).length} custom macros for KaTeX`);

    // Build citation key→number map for ref badges
    const keyToNum = {};
    bibliography.forEach((ref, i) => { keyToNum[ref.key] = i + 1; });

    // Create output folder
    const slug = cleanId.replace(/\./g, '-');
    const outputDir = path.join(DOCS_DIR, slug);
    fs.mkdirSync(outputDir, { recursive: true });

    // Stage 3: Process with tools
    progress('Extracting figures...');
    console.log('[3/5] Extracting figures...');
    const figures = extractFigures(fullTex, tmpDir, outputDir);
    console.log(`[3/5] Extracted ${figures.length} figures (${figures.reduce((n, f) => n + f.images.length, 0)} images)`);

    progress('Resolving cross-references...');
    const labels = collectLabels(fullTex);
    console.log(`[3/5] Found ${labels.size} labels`);

    // Process each section with tools
    progress('Processing sections with tools...');
    const processedSections = [];
    for (const sec of sections) {
        let content = sec.content;

        // Normalize citations FIRST (before any other processing)
        content = normalizeCitations(content);

        // Strip the bibliography block from section content if present
        content = content.replace(/\\begin\{thebibliography\}[\s\S]*?\\end\{thebibliography\}/g, '');

        // Basic LaTeX → Markdown conversion
        content = processSection(content);

        // Replace figures with Markdown image refs
        content = replaceFiguresInText(content, figures);

        // Convert tables
        content = convertTables(content, 'html');

        // Resolve cross-references (but strip \label from math envs first)
        content = resolveRefs(content, labels);

        // Render math with KaTeX (AFTER resolve-refs, which may insert <span> anchors)
        // render-math.js now strips HTML tags from inside math before KaTeX rendering
        content = renderAllMath(content);

        // Convert \cite{key} / [key] citation markers to ref-badge HTML
        // Handle both \cite{key} and [key] patterns that survived processing
        content = content.replace(/\[([A-Za-z][A-Za-z0-9_:.-]*(?:,\s*[A-Za-z][A-Za-z0-9_:.-]*)*)\]/g, (match, keys) => {
            const parts = keys.split(',').map(k => k.trim());
            // Only convert if at least one key matches a known bibliography entry
            const anyMatch = parts.some(k => keyToNum[k]);
            if (!anyMatch) return match; // Leave non-citation brackets alone

            return parts.map(k => {
                const num = keyToNum[k] || k;
                const ref = bibliography.find(r => r.key === k);
                const title = ref ? ref.title : k;
                const arxivAttr = ref && ref.arxivId ? ` data-arxiv-id="${ref.arxivId}"` : '';
                return `<sup class="ref-badge" data-ref="${num}" data-title="${escapeHtml(title)}"${arxivAttr}>${num}</sup>`;
            }).join('');
        });

        // Wrap paragraphs
        content = content
            .split(/\n\n+/)
            .map(p => {
                p = p.trim();
                if (!p) return '';
                if (p.startsWith('<') || p.startsWith('#') || p.startsWith('-') || p.startsWith('|') || p.match(/^\d+\./)) return p;
                return `<p>${p}</p>`;
            })
            .filter(p => p)
            .join('\n\n');

        processedSections.push({
            ...sec,
            html: content,
        });
    }

    // Stage 4: LLM Annotation (optional)
    progress('LLM annotation phase...');
    const llmSections = await annotateWithLLM(sections, bibRaw, progress);

    // Stage 5: Assemble
    progress('Assembling document...');
    const html = assembleHtml(meta, processedSections, figures, bibliography, outputDir);

    // Write paper.html
    fs.writeFileSync(path.join(outputDir, 'paper.html'), html, 'utf-8');

    // Write metadata.yaml
    const metadataYaml = {
        title: meta.title,
        short_title: meta.title.length > 40 ? meta.title.substring(0, 40) + '…' : meta.title,
        type: 'journal-article',
        authors: meta.authors.map(name => {
            const parts = name.split(' ');
            return { given: parts.slice(0, -1).join(' '), family: parts[parts.length - 1] };
        }),
        date: new Date().toISOString().split('T')[0],
        url: `https://arxiv.org/abs/${cleanId}`,
        pdf: `https://arxiv.org/pdf/${cleanId}`,
        arxiv_id: cleanId,
        archive: 'arxiv',
        archive_url: `https://arxiv.org/abs/${cleanId}`,
        source: 'arxiv-pipeline',
        pipeline_version: '2.1',
        tags: ['auto-imported', 'arxiv-pipeline'],
        abstract: meta.abstract.substring(0, 500),
        files: [
            { name: 'paper.html', format: 'html', description: 'Rendered with KaTeX math and extracted figures', primary: true },
        ],
        variable_count: 0,
        equation_count: processedSections.reduce((n, s) => n + (s.html.match(/math-display/g) || []).length, 0),
        reference_count: bibliography.length,
        sections: sections.length,
        figures: figures.length,
    };

    // Also write an MD version for the LLM-annotated content
    if (llmSections && llmSections.some(s => s !== null)) {
        let md = `# ${meta.title}\n\n`;
        md += `> **Authors:** ${meta.authors.join(', ')}\n\n---\n\n`;
        if (meta.abstract) md += `## Abstract\n\n${meta.abstract}\n\n---\n\n`;
        for (let i = 0; i < sections.length; i++) {
            const llm = llmSections[i];
            if (llm) {
                md += llm + '\n\n---\n\n';
            } else {
                md += `## ${sections[i].number}. ${sections[i].title}\n\n${processSection(sections[i].content)}\n\n---\n\n`;
            }
        }
        fs.writeFileSync(path.join(outputDir, 'paper.md'), md, 'utf-8');
        metadataYaml.files.push({ name: 'paper.md', format: 'markdown', description: 'LLM-annotated Markdown with @var-defs' });
    }

    fs.writeFileSync(path.join(outputDir, 'metadata.yaml'), yaml.dump(metadataYaml, { lineWidth: 100 }), 'utf-8');

    // Cleanup temp
    try { fs.rmSync(tmpDir, { recursive: true }); } catch { }

    const result = {
        id: slug,
        filename: 'paper.html',
        path: path.join(outputDir, 'paper.html'),
        sections: sections.length,
        figures: figures.length,
        equations: metadataYaml.equation_count,
        bytes: html.length,
    };

    console.log(`[5/5] ✅ Saved to ${outputDir}/ (${html.length} bytes, ${figures.length} figures, ${metadataYaml.equation_count} equations)`);
    return result;
}

// CLI
if (require.main === module) {
    const arxivId = process.argv[2];
    if (!arxivId) {
        console.error('Usage: node arxiv-pipeline.js <arxiv-id>');
        console.error('  e.g.: node arxiv-pipeline.js 1706.03762');
        process.exit(1);
    }
    importArxiv(arxivId).then(result => {
        console.log('\nResult:', JSON.stringify(result, null, 2));
    }).catch(err => {
        console.error('Pipeline failed:', err.message);
        process.exit(1);
    });
}

module.exports = { importArxiv };

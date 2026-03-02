/**
 * render-math.js — Server-side KaTeX rendering for LaTeX math
 *
 * Converts raw LaTeX math notation in text to rendered HTML:
 *   - Display math: $$...$$ and \begin{equation}...\end{equation}
 *   - Inline math: $...$
 *   - Align environments: \begin{align}...\end{align}
 *
 * Also wraps variables in <span class="var" data-var="..."> for the reader.
 */

const katex = require('katex');

// Known variable symbols to auto-annotate
const VAR_DESCRIPTIONS = {
    Q: 'Query matrix — packed queries (shape: seq_len × d_k)',
    K: 'Key matrix — packed keys (shape: seq_len × d_k)',
    V: 'Value matrix — packed values (shape: seq_len × d_v)',
    d_k: 'Dimension of key and query vectors (d_k = 64)',
    d_v: 'Dimension of value vectors (d_v = 64)',
    d_model: 'Model embedding dimension (d_model = 512)',
    h: 'Number of parallel attention heads (h = 8)',
    W: 'Weight matrix',
    b: 'Bias vector',
    x: 'Input tensor',
    n: 'Sequence length',
    T: 'Transpose',
};

const VAR_COLORS = {
    Q: '#f0a050', K: '#58a6ff', V: '#7ee787', d_k: '#79c0ff',
    d_v: '#ffa657', d_model: '#d2a8ff', h: '#ff7b72', W: '#a5d6ff',
    b: '#ffd700', x: '#98c379', n: '#c678dd',
};

/**
 * Render a LaTeX math string to HTML using KaTeX
 */
function renderMath(latex, displayMode = false) {
    try {
        // Clean common LaTeX issues
        let clean = latex.trim();
        // Strip HTML tags that may have leaked in (e.g. label-anchor spans)
        clean = clean.replace(/<[^>]+>/g, '');
        clean = clean.replace(/\\label\{[^}]*\}/g, '');
        clean = clean.replace(/\\tag\{[^}]*\}/g, '');
        clean = clean.replace(/\\nonumber/g, '');
        // Unescape any HTML entities in math content
        clean = clean.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

        return katex.renderToString(clean, {
            displayMode,
            throwOnError: false,
            trust: true,
            strict: false,
            macros: Object.assign({
                '\\R': '\\mathbb{R}',
                '\\N': '\\mathbb{N}',
                '\\Z': '\\mathbb{Z}',
                '\\softmax': '\\text{softmax}',
                '\\Attention': '\\text{Attention}',
                '\\MultiHead': '\\text{MultiHead}',
                '\\FFN': '\\text{FFN}',
                '\\LayerNorm': '\\text{LayerNorm}',
                '\\Concat': '\\text{Concat}',
                '\\head': '\\text{head}',
            }, _customMacros),
        });
    } catch (e) {
        // Return raw LaTeX in a styled span on failure
        return `<span class="math-error" title="${e.message}">${escapeHtml(latex)}</span>`;
    }
}

/**
 * Post-process KaTeX HTML to add var annotations
 */
function annotateVarsInMath(html, varDescriptions = {}) {
    const descs = { ...VAR_DESCRIPTIONS, ...varDescriptions };
    const colors = { ...VAR_COLORS };

    // Find standalone variable letters/symbols in the KaTeX output
    for (const [varName, desc] of Object.entries(descs)) {
        const color = colors[varName] || '#f0a050';

        if (varName.length === 1) {
            // Single letter variables — wrap the mord mathnormal spans
            const regex = new RegExp(
                `(<span class="mord mathnormal"[^>]*>)(${escapeRegex(varName)})(</span>)`,
                'g'
            );
            html = html.replace(regex, (_, pre, letter, post) => {
                return `<span class="var" data-var="${varName}" data-desc="${escapeHtml(desc)}" style="--var-color: ${color}">${pre}${letter}${post}</span>`;
            });
        }
    }

    return html;
}

/**
 * Process a full text: find all math expressions and render them
 */
function renderAllMath(text, varDescriptions = {}) {
    let result = text;

    // 1. Display math environments: \begin{equation}...\end{equation}
    result = result.replace(
        /\\begin\{(equation|align|gather|multline)\*?\}([\s\S]*?)\\end\{\1\*?\}/g,
        (match, env, content) => {
            let lines;
            if (env === 'align') {
                // Split align into separate lines
                lines = content.split('\\\\').map(l => l.replace(/&/g, ' ').trim()).filter(l => l);
            } else {
                lines = [content.trim()];
            }

            const rendered = lines.map(line => {
                let html = renderMath(line, true);
                html = annotateVarsInMath(html, varDescriptions);
                return `<div class="math-display">${html}</div>`;
            }).join('\n');

            return '\n' + rendered + '\n';
        }
    );

    // 2. Display math: $$...$$ (but not single $)
    result = result.replace(
        /\$\$([\s\S]*?)\$\$/g,
        (_, content) => {
            let html = renderMath(content.trim(), true);
            html = annotateVarsInMath(html, varDescriptions);
            return `\n<div class="math-display">${html}</div>\n`;
        }
    );

    // 3. Inline math: $...$ (single dollar)
    result = result.replace(
        /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$/g,
        (_, content) => {
            let html = renderMath(content.trim(), false);
            html = annotateVarsInMath(html, varDescriptions);
            return `<span class="math-inline">${html}</span>`;
        }
    );

    return result;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/**
 * Extract \newcommand and \def macros from TeX preamble for use in KaTeX
 */
function extractKatexMacros(tex) {
    const macros = {};
    // \newcommand{\name}[n]{def} and \newcommand{\name}{def}
    const newcmd = /\\(?:newcommand|renewcommand)\{\\([a-zA-Z]+)\}(?:\[\d+\])?\{([^}]*)\}/g;
    let m;
    while ((m = newcmd.exec(tex)) !== null) {
        let def = m[2]
            .replace(/\\mbox\{\\boldmath\{\$([^$]*)\$\}\}/g, '\\boldsymbol{$1}')
            .replace(/\\mbox\{\\boldmath\{([^}]*)\}\}/g, '\\boldsymbol{$1}')
            .replace(/\\ensuremath\{([^}]*)\}/g, '$1')
            .replace(/\\mbox\{([^}]*)\}/g, '\\text{$1}')
            .replace(/\$/g, '');
        macros['\\' + m[1]] = def;
    }
    // \def\name{def} — handle nested braces
    const defRe = /\\def\\([a-zA-Z]+)/g;
    while ((m = defRe.exec(tex)) !== null) {
        const name = m[1];
        // Find the balanced brace content starting after \def\name
        let pos = m.index + m[0].length;
        while (pos < tex.length && tex[pos] !== '{') pos++;
        if (pos >= tex.length) continue;
        let depth = 0, start = pos, end = pos;
        for (let i = pos; i < tex.length; i++) {
            if (tex[i] === '{') depth++;
            else if (tex[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        let defVal = tex.substring(start + 1, end);
        defVal = defVal
            .replace(/\\boldsymbol\{\\mathbf\{#1\}\}/g, '\\boldsymbol{#1}')
            .replace(/\\vec\{([^}]*)\}/g, '\\boldsymbol{$1}');
        macros['\\' + name] = defVal;
    }
    return macros;
}

let _customMacros = {};
function setCustomMacros(m) { _customMacros = m || {}; }
function getCustomMacros() { return _customMacros; }

module.exports = { renderMath, renderAllMath, annotateVarsInMath, extractKatexMacros, setCustomMacros };

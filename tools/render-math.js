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

// Stored custom macros (set by pipeline before rendering)
let _customMacros = {};

/**
 * Set custom macros extracted from TeX preamble (called by pipeline)
 */
function setCustomMacros(macros) {
    _customMacros = macros || {};
}

/**
 * Extract KaTeX-compatible macros from TeX \newcommand and \def definitions
 */
function extractKatexMacros(texSource) {
    const macros = {};

    // Match \newcommand{\name}[args]{replacement} and \newcommand{\name}{replacement}
    const ncRe = /\\newcommand\{?\\(\w+)\}?(?:\[(\d+)\])?\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g;
    let m;
    while ((m = ncRe.exec(texSource)) !== null) {
        const name = m[1];
        const numArgs = parseInt(m[2] || '0');
        const replacement = m[3];
        // KaTeX handles #1, #2 etc natively in macro definitions
        macros['\\' + name] = replacement;
    }

    // Match \def\name{replacement} (zero-arg only)
    const defRe = /\\def\\(\w+)\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g;
    while ((m = defRe.exec(texSource)) !== null) {
        macros['\\' + m[1]] = m[2];
    }

    // Match \DeclareMathOperator{\name}{text}
    const dmoRe = /\\DeclareMathOperator\{\\(\w+)\}\{([^}]+)\}/g;
    while ((m = dmoRe.exec(texSource)) !== null) {
        macros['\\' + m[1]] = '\\operatorname{' + m[2] + '}';
    }

    return macros;
}

/**
 * Render a LaTeX math string to HTML using KaTeX
 */
function renderMath(latex, displayMode = false, extraMacros = {}) {
    try {
        // Clean common LaTeX issues
        let clean = latex.trim();
        clean = clean.replace(/\\label\{[^}]*\}/g, '');
        clean = clean.replace(/\\tag\{[^}]*\}/g, '');
        clean = clean.replace(/\\nonumber/g, '');

        // Strip HTML tags that leaked into math (e.g., <span> label anchors)
        clean = clean.replace(/<[^>]+>/g, '');
        // Unescape HTML entities that may have been escaped
        clean = clean.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');

        const defaultMacros = {
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
        };

        return katex.renderToString(clean, {
            displayMode,
            throwOnError: false,
            trust: true,
            strict: false,
            macros: { ...defaultMacros, ..._customMacros, ...extraMacros },
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

    // 3. Inline math: $...$ (single dollar) — don't match across line breaks
    result = result.replace(
        /(?<!\$)\$(?!\$)((?:[^$\\\n]|\\.)+?)\$/g,
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

module.exports = { renderMath, renderAllMath, annotateVarsInMath, setCustomMacros, extractKatexMacros };

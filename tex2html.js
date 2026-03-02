/**
 * tex2html.js — Lightweight LaTeX→HTML converter for Scholarly Reader
 *
 * Handles the subset of LaTeX constructs found in arXiv papers:
 * - \input{file} resolution
 * - \section, \subsection, \subsubsection, \paragraph
 * - \begin{equation}/\begin{align*} → math display
 * - Inline $...$ math
 * - \textbf, \textit, \emph, \texttt
 * - \citep, \cite → ref badges
 * - \begin{itemize}/\begin{enumerate}
 * - \begin{table}/\begin{tabular}
 * - Comments (%)
 * - Custom \newcommand macros (basic)
 */

const fs = require('fs');
const path = require('path');

function convertTexToHtml(mainTexPath) {
    const baseDir = path.dirname(mainTexPath);

    // Read and resolve \input{} directives
    let tex = readAndResolveInputs(mainTexPath, baseDir);

    // Extract custom \newcommand definitions
    const macros = extractMacros(tex);

    // Apply macros
    tex = applyMacros(tex, macros);

    // Strip preamble (everything before \begin{document})
    const docMatch = tex.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
    if (docMatch) tex = docMatch[1];

    // Strip \maketitle, \begin{center}...\end{center} with color commands
    tex = tex.replace(/\\maketitle/g, '');
    tex = tex.replace(/\\begin\{center\}\s*\\color\{red\}[\s\S]*?\\end\{center\}/g, '');

    // Extract title and abstract
    let html = '';

    // Title
    const titleMatch = tex.match(/\\title\{([^}]+)\}/);
    // Abstract
    const abstractMatch = tex.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);

    // Process the body
    let body = tex;
    // Remove title/abstract from body since we handle them separately
    body = body.replace(/\\title\{[^}]+\}/, '');
    body = body.replace(/\\begin\{abstract\}[\s\S]*?\\end\{abstract\}/, '');

    // Process authors block
    body = body.replace(/\\author\{[\s\S]*?\}\s*/g, '');

    // Build HTML
    if (titleMatch) {
        html += `<h1>${cleanText(titleMatch[1])}</h1>\n\n`;
    }

    if (abstractMatch) {
        html += `<h2>Abstract</h2>\n<p>${cleanText(abstractMatch[1].trim())}</p>\n\n<hr>\n\n`;
    }

    // Convert sections
    body = convertSections(body);

    // Convert math environments
    body = convertMath(body);

    // Convert formatting
    body = convertFormatting(body);

    // Convert lists
    body = convertLists(body);

    // Convert tables
    body = convertTables(body);

    // Convert citations
    body = convertCitations(body);

    // Convert figures
    body = convertFigures(body);

    // Convert paragraphs
    body = convertParagraphs(body);

    // Strip bibliography (we handle it separately)
    const bibMatch = body.match(/\\begin\{thebibliography\}[\s\S]*?\\end\{thebibliography\}/);
    let refs = [];
    if (bibMatch) {
        refs = extractBibliography(bibMatch[0]);
        body = body.replace(bibMatch[0], '');
    }

    // Clean up remaining LaTeX commands
    body = cleanRemainingLatex(body);

    // Add reference section if we have refs
    if (refs.length > 0) {
        body += '\n<h2>References</h2>\n<ol class="references">\n';
        refs.forEach(ref => {
            body += `  <li id="ref-${ref.key}"><strong>${ref.authors}</strong> ${ref.title}. <em>${ref.venue}</em></li>\n`;
        });
        body += '</ol>\n';
    }

    html += body;

    // Final cleanup
    html = html.replace(/\n{3,}/g, '\n\n');
    html = html.replace(/\\\\(\s)/g, '<br>$1');
    html = html.replace(/\\%/g, '%');
    html = html.replace(/\\&/g, '&amp;');
    html = html.replace(/\\\$/g, '$');
    html = html.replace(/\\#/g, '#');
    html = html.replace(/\{\\em\s+([^}]*)\}/g, '<em>$1</em>');
    html = html.replace(/\{\\bf\s+([^}]*)\}/g, '<strong>$1</strong>');

    return html;
}

function readAndResolveInputs(filePath, baseDir) {
    let content = fs.readFileSync(filePath, 'utf-8');

    // Resolve \input{filename} (with or without .tex extension)
    content = content.replace(/\\input\{([^}]+)\}/g, (match, filename) => {
        let inputPath = path.join(baseDir, filename);
        if (!inputPath.endsWith('.tex')) inputPath += '.tex';
        try {
            return readAndResolveInputs(inputPath, baseDir);
        } catch (e) {
            return `<!-- Could not resolve \\input{${filename}} -->`;
        }
    });

    // Also handle \subfile{} the same way
    content = content.replace(/\\subfile\{([^}]+)\}/g, (match, filename) => {
        let inputPath = path.join(baseDir, filename);
        if (!inputPath.endsWith('.tex')) inputPath += '.tex';
        try {
            return readAndResolveInputs(inputPath, baseDir);
        } catch (e) {
            return `<!-- Could not resolve \\subfile{${filename}} -->`;
        }
    });

    return content;
}

function extractMacros(tex) {
    const macros = {};
    // Match \newcommand{\name}{replacement} and \newcommand{\name}[args]{replacement}
    const re = /\\newcommand\{?\\(\w+)\}?(?:\[(\d+)\])?\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
    let m;
    while ((m = re.exec(tex)) !== null) {
        macros[m[1]] = { args: parseInt(m[2] || '0'), replacement: m[3] };
    }
    return macros;
}

function applyMacros(tex, macros) {
    // Apply simple zero-arg macros
    for (const [name, def] of Object.entries(macros)) {
        if (def.args === 0) {
            const re = new RegExp(`\\\\${name}(?![a-zA-Z])`, 'g');
            tex = tex.replace(re, def.replacement);
        }
    }
    // Apply one-arg macros
    for (const [name, def] of Object.entries(macros)) {
        if (def.args === 1) {
            const re = new RegExp(`\\\\${name}\\{([^}]*)\\}`, 'g');
            tex = tex.replace(re, (_, arg) => def.replacement.replace(/#1/g, arg));
        }
    }
    return tex;
}

function convertSections(tex) {
    tex = tex.replace(/\\section\*?\{([^}]+)\}\s*(?:\\label\{[^}]+\})?/g, '<hr>\n\n<h2>$1</h2>\n');
    tex = tex.replace(/\\subsection\*?\{([^}]+)\}\s*(?:\\label\{[^}]+\})?/g, '<h3>$1</h3>\n');
    tex = tex.replace(/\\subsubsection\*?\{([^}]+)\}\s*(?:\\label\{[^}]+\})?/g, '<h4>$1</h4>\n');
    tex = tex.replace(/\\paragraph\{([^}]+)\}/g, '<p><strong>$1</strong></p>\n');
    return tex;
}

function convertMath(tex) {
    // Display math: \begin{equation}...\end{equation}
    tex = tex.replace(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}/g, (_, math) => {
        return `<div class="math-display"><span class="math-raw">${escapeHtml(math.trim())}</span></div>`;
    });

    // align/align*
    tex = tex.replace(/\\begin\{align\*?\}([\s\S]*?)\\end\{align\*?\}/g, (_, math) => {
        // Split on \\ for multiple lines
        const lines = math.split('\\\\').map(l => l.trim()).filter(l => l);
        const formatted = lines.map(l => l.replace(/&/g, ' ')).join('\n');
        return `<div class="math-display"><span class="math-raw">${escapeHtml(formatted)}</span></div>`;
    });

    // Display math: $$...$$
    tex = tex.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
        return `<div class="math-display"><span class="math-raw">${escapeHtml(math.trim())}</span></div>`;
    });

    // Inline math: $...$
    tex = tex.replace(/\$([^$]+)\$/g, (_, math) => {
        return `<span class="math-inline"><span class="math-raw">${escapeHtml(math)}</span></span>`;
    });

    return tex;
}

function convertFormatting(tex) {
    tex = tex.replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>');
    tex = tex.replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>');
    tex = tex.replace(/\\emph\{([^}]+)\}/g, '<em>$1</em>');
    tex = tex.replace(/\\texttt\{([^}]+)\}/g, '<code>$1</code>');
    tex = tex.replace(/\\url\{([^}]+)\}/g, '<a href="$1">$1</a>');
    tex = tex.replace(/\\href\{([^}]+)\}\{([^}]+)\}/g, '<a href="$1">$2</a>');
    tex = tex.replace(/\\footnote\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g, ' <sup class="footnote">*</sup>');
    tex = tex.replace(/\\footnotemark\[\d+\]/g, '');
    tex = tex.replace(/~(?!\\)/g, ' '); // non-breaking space
    return tex;
}

function convertLists(tex) {
    tex = tex.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, content) => {
        const items = content.split('\\item').filter(s => s.trim());
        return '<ul>\n' + items.map(item => `  <li>${cleanText(item.trim())}</li>`).join('\n') + '\n</ul>';
    });

    tex = tex.replace(/\\begin\{enumerate\}(?:\[.*?\])?([\s\S]*?)\\end\{enumerate\}/g, (_, content) => {
        const items = content.split('\\item').filter(s => s.trim());
        return '<ol>\n' + items.map(item => `  <li>${cleanText(item.trim())}</li>`).join('\n') + '\n</ol>';
    });

    return tex;
}

function convertTables(tex) {
    tex = tex.replace(/\\begin\{table\}[\s\S]*?\\begin\{tabular\}\{([^}]*)\}([\s\S]*?)\\end\{tabular\}[\s\S]*?\\end\{table\}/g, (_, cols, content) => {
        return convertTabular(content);
    });

    // Standalone tabular
    tex = tex.replace(/\\begin\{tabular\}\{([^}]*)\}([\s\S]*?)\\end\{tabular\}/g, (_, cols, content) => {
        return convertTabular(content);
    });

    return tex;
}

function convertTabular(content) {
    // Remove \hline, \toprule, \midrule, \bottomrule, \cline
    content = content.replace(/\\(hline|toprule|midrule|bottomrule|cline\{[^}]+\})/g, '');
    content = content.replace(/\\multirow\{\d+\}\{[^}]*\}\{([^}]*)\}/g, '$1');
    content = content.replace(/\\multicolumn\{\d+\}\{[^}]*\}\{([^}]*)\}/g, '$1');

    const rows = content.split('\\\\').map(r => r.trim()).filter(r => r);

    if (rows.length === 0) return '';

    let html = '<table>\n  <thead>\n    <tr>';
    const headerCells = rows[0].split('&').map(c => c.trim());
    headerCells.forEach(cell => { html += `<th>${cleanText(cell)}</th>`; });
    html += '</tr>\n  </thead>\n  <tbody>\n';

    for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].split('&').map(c => c.trim());
        html += '    <tr>';
        cells.forEach(cell => { html += `<td>${cleanText(cell)}</td>`; });
        html += '</tr>\n';
    }
    html += '  </tbody>\n</table>';
    return html;
}

function convertCitations(tex) {
    // Convert \citep{key1,key2} and \cite{key1,key2} to ref badges
    tex = tex.replace(/\\cite[pt]?\{([^}]+)\}/g, (_, keys) => {
        return keys.split(',').map(k => {
            const key = k.trim();
            return `<sup class="ref-badge" data-ref="${key}">[${key}]</sup>`;
        }).join('');
    });
    return tex;
}

function convertFigures(tex) {
    tex = tex.replace(/\\begin\{figure\}[\s\S]*?\\includegraphics(?:\[.*?\])?\{([^}]+)\}[\s\S]*?\\caption\{([\s\S]*?)\}[\s\S]*?\\end\{figure\}/g, (_, imgPath, caption) => {
        return `<figure><figcaption>${cleanText(caption.trim())}</figcaption></figure>`;
    });

    // Handle minipage figures
    tex = tex.replace(/\\begin\{figure\}([\s\S]*?)\\end\{figure\}/g, (_, content) => {
        const captions = [];
        content.replace(/\\caption\{([\s\S]*?)\}/g, (_, cap) => {
            captions.push(cleanText(cap.trim()));
        });
        if (captions.length > 0) {
            return `<figure><figcaption>${captions.join(' ')}</figcaption></figure>`;
        }
        return '';
    });

    return tex;
}

function convertParagraphs(tex) {
    // Remove lone \label{} commands
    tex = tex.replace(/\\label\{[^}]+\}/g, '');

    // Remove comments (lines starting with %)
    tex = tex.replace(/^%.*$/gm, '');
    // Remove inline comments (but not \%)
    tex = tex.replace(/(?<!\\)%.*$/gm, '');

    // Wrap non-tagged text blocks in <p> tags
    const lines = tex.split('\n');
    let result = '';
    let currentBlock = '';

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === '') {
            if (currentBlock.trim()) {
                // Check if block starts with an HTML tag
                const block = currentBlock.trim();
                if (block.startsWith('<h') || block.startsWith('<div') || block.startsWith('<table') ||
                    block.startsWith('<ul') || block.startsWith('<ol') || block.startsWith('<hr') ||
                    block.startsWith('<figure') || block.startsWith('<p>')) {
                    result += block + '\n\n';
                } else {
                    result += `<p>${block}</p>\n\n`;
                }
            }
            currentBlock = '';
        } else {
            currentBlock += (currentBlock ? ' ' : '') + trimmed;
        }
    }

    // Handle remaining block
    if (currentBlock.trim()) {
        const block = currentBlock.trim();
        if (block.startsWith('<h') || block.startsWith('<div') || block.startsWith('<table') ||
            block.startsWith('<ul') || block.startsWith('<ol') || block.startsWith('<hr') ||
            block.startsWith('<figure') || block.startsWith('<p>')) {
            result += block + '\n';
        } else {
            result += `<p>${block}</p>\n`;
        }
    }

    return result;
}

function extractBibliography(bibTex) {
    const refs = [];
    const items = bibTex.split('\\bibitem{');

    for (let i = 1; i < items.length; i++) {
        const closeBrace = items[i].indexOf('}');
        const key = items[i].substring(0, closeBrace);
        let content = items[i].substring(closeBrace + 1).trim();

        // Clean up newblock
        content = content.replace(/\\newblock\s*/g, '');

        // Extract parts
        const parts = content.split('\n').map(l => l.trim()).filter(l => l);
        const authors = cleanText(parts[0] || '');
        const title = cleanText(parts[1] || '');
        const venue = cleanText(parts.slice(2).join(' '));

        refs.push({ key, authors, title, venue });
    }

    // Deduplicate: remove entries with same title (keep first occurrence)
    const seen = new Set();
    const deduped = [];
    for (const ref of refs) {
        const key = ref.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 40);
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        deduped.push(ref);
    }

    return deduped;
}

function cleanRemainingLatex(tex) {
    // Remove remaining \begin/\end blocks we don't handle
    tex = tex.replace(/\\begin\{[^}]+\}(\[.*?\])?/g, '');
    tex = tex.replace(/\\end\{[^}]+\}/g, '');

    // Remove \vspace, \hspace, \noindent, etc.
    tex = tex.replace(/\\(vspace|hspace|noindent|centering|raggedright|raggedleft|small|large|Large|normalsize|bigskip|medskip|smallskip|newpage|clearpage|pagebreak)\b(\{[^}]*\})?/g, '');

    // Remove \thanks{} and \samethanks
    tex = tex.replace(/\\thanks\{[^}]*\}/g, '');
    tex = tex.replace(/\\samethanks(\[.*?\])?/g, '');

    // Remove \And, \AND
    tex = tex.replace(/\\(And|AND)\s*/g, '');

    // Remove remaining \command that we haven't handled
    tex = tex.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1');

    return tex;
}

function cleanText(text) {
    text = text.replace(/\\textbf\{([^}]+)\}/g, '<strong>$1</strong>');
    text = text.replace(/\\textit\{([^}]+)\}/g, '<em>$1</em>');
    text = text.replace(/\\emph\{([^}]+)\}/g, '<em>$1</em>');
    text = text.replace(/\{\\em\s+([^}]*)\}/g, '<em>$1</em>');
    text = text.replace(/\\url\{([^}]+)\}/g, '<a href="$1">$1</a>');
    text = text.replace(/~(?!\\)/g, ' ');
    text = text.replace(/``/g, '\u201c');
    text = text.replace(/''/g, '\u201d');
    text = text.replace(/\\&/g, '&amp;');
    text = text.replace(/---/g, '\u2014');
    text = text.replace(/--/g, '\u2013');
    text = text.replace(/\\\\/g, '');
    return text;
}

function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// CLI: node tex2html.js input.tex > output.html
if (require.main === module) {
    const inputFile = process.argv[2];
    if (!inputFile) {
        console.error('Usage: node tex2html.js <input.tex>');
        process.exit(1);
    }
    const html = convertTexToHtml(path.resolve(inputFile));
    console.log(html);
}

module.exports = { convertTexToHtml };

/**
 * convert-tables.js — Convert LaTeX tables to Markdown/HTML
 *
 * Handles:
 *   - \begin{tabular}{lcc}...\end{tabular}
 *   - \begin{table}...\end{table} (wrapper with caption)
 *   - \hline, \toprule, \midrule, \bottomrule
 *   - \multicolumn{n}{align}{text}
 *   - Basic formatting inside cells
 */

/**
 * Parse a tabular environment into a 2D array of cells
 */
function parseTabular(tabularContent, colSpec) {
    // Remove booktabs rules
    let content = tabularContent;
    content = content.replace(/\\(toprule|midrule|bottomrule|hline)/g, '');
    content = content.replace(/\\cline\{[^}]*\}/g, '');
    content = content.replace(/\\rule\{[^}]*\}\{[^}]*\}/g, '');

    // Split into rows
    const rows = content.split('\\\\')
        .map(r => r.trim())
        .filter(r => r.length > 0);

    const table = [];
    for (const row of rows) {
        const cells = row.split('&').map(cell => {
            let c = cell.trim();
            // Clean formatting
            c = c.replace(/\\textbf\{([^}]*)\}/g, '**$1**');
            c = c.replace(/\\textit\{([^}]*)\}/g, '*$1*');
            c = c.replace(/\\emph\{([^}]*)\}/g, '*$1*');
            c = c.replace(/\\cite[pt]?\{[^}]*\}/g, '');
            c = c.replace(/~(?!\\)/g, ' ');
            c = c.replace(/\$([^$]+)\$/g, '$$$1$$'); // preserve inline math
            return c;
        });
        table.push(cells);
    }

    return table;
}

/**
 * Convert a 2D table array to Markdown table syntax
 */
function tableToMarkdown(table, caption) {
    if (table.length === 0) return '';

    // Normalize column count
    const maxCols = Math.max(...table.map(row => row.length));
    const normalized = table.map(row => {
        while (row.length < maxCols) row.push('');
        return row;
    });

    let md = '';
    if (caption) {
        md += `\n**${caption}**\n\n`;
    }

    // Header row
    md += '| ' + normalized[0].map(c => c || '').join(' | ') + ' |\n';
    md += '| ' + normalized[0].map(() => '---').join(' | ') + ' |\n';

    // Data rows
    for (let i = 1; i < normalized.length; i++) {
        md += '| ' + normalized[i].map(c => c || '').join(' | ') + ' |\n';
    }

    return md;
}

/**
 * Convert a 2D table array to HTML
 */
function tableToHtml(table, caption) {
    if (table.length === 0) return '';

    let html = '<table class="article-table">\n';
    if (caption) {
        html += `  <caption>${caption}</caption>\n`;
    }

    // Header
    html += '  <thead><tr>\n';
    for (const cell of table[0]) {
        html += `    <th>${cell}</th>\n`;
    }
    html += '  </tr></thead>\n';

    // Body
    html += '  <tbody>\n';
    for (let i = 1; i < table.length; i++) {
        html += '  <tr>\n';
        for (const cell of table[i]) {
            html += `    <td>${cell}</td>\n`;
        }
        html += '  </tr>\n';
    }
    html += '  </tbody>\n</table>\n';

    return html;
}

/**
 * Find and convert all tables in LaTeX text
 *
 * @param {string} text - LaTeX source text
 * @param {string} format - 'markdown' or 'html'
 * @returns {string} Text with tables converted
 */
function convertTables(text, format = 'html') {
    let result = text;

    // Handle \begin{table}...\end{table} wrappers
    result = result.replace(
        /\\begin\{table\*?\}([\s\S]*?)\\end\{table\*?\}/g,
        (match, content) => {
            // Extract caption
            const captionMatch = content.match(/\\caption\{([\s\S]*?)\}(?:\s*\\label)?/);
            let caption = captionMatch ? captionMatch[1]
                .replace(/\\label\{[^}]*\}/g, '')
                .replace(/\\textbf\{([^}]*)\}/g, '$1')
                .trim() : '';

            // Extract tabular
            const tabMatch = content.match(/\\begin\{tabular\}\{([^}]*)\}([\s\S]*?)\\end\{tabular\}/);
            if (!tabMatch) return match;

            const colSpec = tabMatch[1];
            const tabContent = tabMatch[2];
            const table = parseTabular(tabContent, colSpec);

            if (format === 'markdown') {
                return tableToMarkdown(table, caption);
            } else {
                return tableToHtml(table, caption);
            }
        }
    );

    // Handle standalone \begin{tabular}...\end{tabular}
    result = result.replace(
        /\\begin\{tabular\}\{([^}]*)\}([\s\S]*?)\\end\{tabular\}/g,
        (match, colSpec, content) => {
            const table = parseTabular(content, colSpec);
            return format === 'markdown' ? tableToMarkdown(table) : tableToHtml(table);
        }
    );

    return result;
}

module.exports = { convertTables, parseTabular, tableToMarkdown, tableToHtml };

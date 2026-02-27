/**
 * resolve-refs.js — Resolve LaTeX cross-references
 *
 * Two-pass approach:
 *   1. Collect all \label{...} → assign numbers
 *   2. Replace \ref{...}, \eqref{...} with resolved numbers
 */

/**
 * Collect all labels from LaTeX source and assign numbers
 *
 * @param {string} text - Full LaTeX source
 * @returns {Map<string, {type: string, number: string|number}>}
 */
function collectLabels(text) {
    const labels = new Map();
    let eqNum = 0, figNum = 0, tabNum = 0, secNum = 0;

    // Equation labels
    const eqPattern = /\\begin\{(equation|align|gather)\*?\}[\s\S]*?\\label\{([^}]+)\}[\s\S]*?\\end\{\1\*?\}/g;
    let m;
    while ((m = eqPattern.exec(text)) !== null) {
        labels.set(m[2], { type: 'equation', number: ++eqNum });
    }

    // Figure labels
    const figPattern = /\\begin\{figure\*?\}[\s\S]*?\\label\{([^}]+)\}[\s\S]*?\\end\{figure\*?\}/g;
    while ((m = figPattern.exec(text)) !== null) {
        labels.set(m[1], { type: 'figure', number: ++figNum });
    }

    // Table labels
    const tabPattern = /\\begin\{table\*?\}[\s\S]*?\\label\{([^}]+)\}[\s\S]*?\\end\{table\*?\}/g;
    while ((m = tabPattern.exec(text)) !== null) {
        labels.set(m[1], { type: 'table', number: ++tabNum });
    }

    // Section labels
    const secPattern = /\\(?:sub)*section\*?\{[^}]+\}\s*\\label\{([^}]+)\}/g;
    while ((m = secPattern.exec(text)) !== null) {
        labels.set(m[1], { type: 'section', number: ++secNum });
    }

    // Standalone labels (catch-all)
    const standalonePattern = /\\label\{([^}]+)\}/g;
    while ((m = standalonePattern.exec(text)) !== null) {
        if (!labels.has(m[1])) {
            labels.set(m[1], { type: 'unknown', number: '?' });
        }
    }

    return labels;
}

/**
 * Replace \ref{...} and \eqref{...} with resolved numbers
 */
function resolveRefs(text, labels) {
    let result = text;

    // \eqref{key} → (N) with link
    result = result.replace(/\\eqref\{([^}]+)\}/g, (_, key) => {
        const label = labels.get(key);
        if (label) {
            return `<a href="#${key}" class="eq-ref">(${label.number})</a>`;
        }
        return `(?)`;
    });

    // \ref{key} → "N" with context
    result = result.replace(/\\ref\{([^}]+)\}/g, (_, key) => {
        const label = labels.get(key);
        if (label) {
            const prefix = { equation: 'Eq.', figure: 'Fig.', table: 'Table', section: 'Section' }[label.type] || '';
            return `<a href="#${key}" class="cross-ref">${prefix} ${label.number}</a>`;
        }
        return '?';
    });

    // \autoref{key}
    result = result.replace(/\\autoref\{([^}]+)\}/g, (_, key) => {
        const label = labels.get(key);
        if (label) {
            const prefix = { equation: 'Equation', figure: 'Figure', table: 'Table', section: 'Section' }[label.type] || '';
            return `<a href="#${key}" class="cross-ref">${prefix} ${label.number}</a>`;
        }
        return '?';
    });

    // Remove standalone \label{} (already collected)
    result = result.replace(/\\label\{([^}]+)\}/g, (_, key) => {
        return `<span id="${key}" class="label-anchor"></span>`;
    });

    return result;
}

module.exports = { collectLabels, resolveRefs };

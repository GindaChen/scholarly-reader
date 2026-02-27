/**
 * extract-figures.js — Extract figures from LaTeX source
 *
 * Parses \begin{figure}...\end{figure} blocks:
 *   - Copies referenced images (.png, .jpg, .eps) to doc folder
 *   - Converts .pdf figures to .png using pdftoppm (if available)
 *   - Returns Markdown image references with captions
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Check if pdftoppm is available
 */
function hasPdftoppm() {
    try {
        execSync('which pdftoppm', { stdio: 'pipe' });
        return true;
    } catch { return false; }
}

/**
 * Convert a PDF file to PNG
 */
function convertPdfToPng(pdfPath, outputDir) {
    const basename = path.basename(pdfPath, '.pdf');
    const outputPrefix = path.join(outputDir, basename);

    if (hasPdftoppm()) {
        try {
            execSync(`pdftoppm -png -r 300 -singlefile "${pdfPath}" "${outputPrefix}"`, { timeout: 30000 });
            return `${basename}.png`;
        } catch (e) {
            console.warn(`  ⚠️  pdftoppm failed for ${pdfPath}: ${e.message}`);
        }
    }

    // Fallback: try ImageMagick convert
    try {
        execSync(`which convert`, { stdio: 'pipe' });
        execSync(`convert -density 300 "${pdfPath}" "${outputPrefix}.png"`, { timeout: 30000 });
        return `${basename}.png`;
    } catch { }

    // Fallback: try sips (macOS built-in) — doesn't handle PDF well but worth trying
    try {
        execSync(`sips -s format png "${pdfPath}" --out "${outputPrefix}.png" 2>/dev/null`, { timeout: 10000 });
        if (fs.existsSync(`${outputPrefix}.png`)) return `${basename}.png`;
    } catch { }

    console.warn(`  ⚠️  No PDF converter available for ${pdfPath}`);
    return null;
}

/**
 * Extract all figures from LaTeX content
 *
 * @param {string} texContent - Full LaTeX source
 * @param {string} texBaseDir - Directory containing TeX files (for resolving relative paths)
 * @param {string} outputDir  - Where to copy/convert images to (the doc folder)
 * @returns {Object[]} Array of { id, caption, imagePath, width, label }
 */
function extractFigures(texContent, texBaseDir, outputDir) {
    const figuresDir = path.join(outputDir, 'figures');
    if (!fs.existsSync(figuresDir)) fs.mkdirSync(figuresDir, { recursive: true });

    const figures = [];
    const figurePattern = /\\begin\{figure\*?\}([\s\S]*?)\\end\{figure\*?\}/g;
    let match;
    let index = 0;

    while ((match = figurePattern.exec(texContent)) !== null) {
        const block = match[1];
        index++;

        // Extract caption
        const captionMatch = block.match(/\\caption\{([\s\S]*?)\}(?:\s*\\label)?/);
        let caption = captionMatch ? captionMatch[1].trim() : `Figure ${index}`;
        // Clean LaTeX from caption
        caption = caption
            .replace(/\\citep?\{[^}]*\}/g, '')
            .replace(/\\textbf\{([^}]*)\}/g, '$1')
            .replace(/\\emph\{([^}]*)\}/g, '$1')
            .replace(/\\ref\{[^}]*\}/g, '?')
            .replace(/\\label\{[^}]*\}/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Extract label
        const labelMatch = block.match(/\\label\{([^}]+)\}/);
        const label = labelMatch ? labelMatch[1] : `fig:${index}`;

        // Extract image path(s)
        const graphicsPattern = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g;
        let imgMatch;
        const images = [];

        while ((imgMatch = graphicsPattern.exec(block)) !== null) {
            let imgPath = imgMatch[1];

            // Try various extensions
            const extensions = ['', '.png', '.jpg', '.jpeg', '.pdf', '.eps'];
            let resolved = null;

            for (const ext of extensions) {
                const tryPath = path.join(texBaseDir, imgPath + ext);
                if (fs.existsSync(tryPath)) {
                    resolved = tryPath;
                    break;
                }
            }

            if (!resolved) {
                console.warn(`  ⚠️  Figure not found: ${imgPath}`);
                continue;
            }

            const ext = path.extname(resolved).toLowerCase();
            let outputFilename;

            if (ext === '.pdf') {
                // Convert PDF to PNG
                outputFilename = convertPdfToPng(resolved, figuresDir);
                if (!outputFilename) continue;
            } else if (['.png', '.jpg', '.jpeg'].includes(ext)) {
                // Copy directly
                outputFilename = path.basename(resolved);
                const dest = path.join(figuresDir, outputFilename);
                if (!fs.existsSync(dest)) {
                    fs.copyFileSync(resolved, dest);
                }
            } else if (ext === '.eps') {
                // Try convert EPS to PNG
                const basename = path.basename(resolved, '.eps');
                try {
                    execSync(`convert "${resolved}" "${path.join(figuresDir, basename + '.png')}"`, { timeout: 30000 });
                    outputFilename = basename + '.png';
                } catch {
                    console.warn(`  ⚠️  Cannot convert EPS: ${resolved}`);
                    continue;
                }
            } else {
                continue;
            }

            images.push(outputFilename);
        }

        // Extract width if specified
        const widthMatch = block.match(/\\includegraphics\[.*?width\s*=\s*([^,\]]+)/);
        const width = widthMatch ? widthMatch[1] : null;

        figures.push({
            id: index,
            label,
            caption,
            images,
            width,
        });
    }

    return figures;
}

/**
 * Convert extracted figures to HTML
 */
function figuresToHtml(figures) {
    return figures.map(fig => {
        const imgs = fig.images.map(img =>
            `<img src="./figures/${img}" alt="${escapeHtml(fig.caption)}" loading="lazy" style="max-width:100%">`
        ).join('\n');
        return `\n<figure id="${fig.label}">\n${imgs}\n<figcaption><strong>Figure ${fig.id}.</strong> ${escapeHtml(fig.caption)}</figcaption>\n</figure>\n`;
    }).join('\n');
}

/**
 * Replace \begin{figure}...\end{figure} blocks in text with HTML images
 */
function replaceFiguresInText(text, figures) {
    let result = text;
    let figIndex = 0;
    result = result.replace(/\\begin\{figure\*?\}[\s\S]*?\\end\{figure\*?\}/g, () => {
        const fig = figures[figIndex++];
        if (!fig || fig.images.length === 0) return '';
        const imgs = fig.images.map(img =>
            `<img src="./figures/${img}" alt="${escapeHtml(fig.caption)}" loading="lazy" style="max-width:100%">`
        ).join('\n');
        return `\n<figure id="${fig.label}">\n${imgs}\n<figcaption><strong>Figure ${fig.id}.</strong> ${escapeHtml(fig.caption)}</figcaption>\n</figure>\n`;
    });
    return result;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = { extractFigures, figuresToHtml, replaceFiguresInText, convertPdfToPng };

// ── Tool: render_katex ── Server-side KaTeX math rendering
import katex from 'katex'
import { Type } from '@sinclair/typebox'

export default function createRenderKatex(ctx = {}) {
    return {
        name: 'render_katex',
        description: `Render LaTeX math expressions to HTML using KaTeX server-side rendering.
Pass raw LaTeX (without $ delimiters). Set displayMode=true for display/block equations, false for inline.
Returns the rendered HTML string that can be embedded directly in the document.
You can batch multiple expressions by separating them with "---SPLIT---" to render them all at once.`,
        label: 'Render KaTeX',
        parameters: Type.Object({
            latex: Type.String({ description: 'Raw LaTeX math expression(s). Separate multiple with "---SPLIT---"' }),
            displayMode: Type.Optional(Type.Boolean({ description: 'true for display mode (block), false for inline (default: false)' })),
        }),
        execute: async (toolCallId, params) => {
            const expressions = params.latex.split('---SPLIT---').map(s => s.trim()).filter(Boolean)
            const results = []

            for (const expr of expressions) {
                try {
                    const html = katex.renderToString(expr, {
                        displayMode: params.displayMode ?? false,
                        throwOnError: false,
                        trust: true,
                        strict: false,
                    })
                    results.push({ input: expr.substring(0, 60), html, error: null })
                } catch (e) {
                    results.push({ input: expr.substring(0, 60), html: `<span class="katex-error" title="${e.message}">${expr}</span>`, error: e.message })
                }
            }

            const output = results.map((r, i) => {
                if (results.length === 1) return r.html
                return `[${i + 1}] ${r.error ? `ERROR: ${r.error}` : r.html}`
            }).join('\n\n')

            return {
                content: [{ type: 'text', text: output }],
                details: { count: results.length, errors: results.filter(r => r.error).length },
            }
        },
    }
}

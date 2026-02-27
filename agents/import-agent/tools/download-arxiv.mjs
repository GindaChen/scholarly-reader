// ── Tool: download_arxiv ── Download & extract arXiv TeX source
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { Type } from '@sinclair/typebox'

const DOCS_DIR = new URL('../../../docs', import.meta.url).pathname
const TEMP_DIR = path.join(DOCS_DIR, '.arxiv-tmp')

export default function createDownloadArxiv(ctx = {}) {
    return {
        name: 'download_arxiv',
        description: `Download and extract an arXiv paper's TeX source files. Returns the extraction directory path and a listing of all files found (TeX, images, etc). The main TeX file (containing \\\\documentclass) is identified automatically.`,
        label: 'Download arXiv Source',
        parameters: Type.Object({
            arxivId: Type.String({ description: 'arXiv paper ID, e.g. "1706.03762" or "2510.18121"' }),
        }),
        execute: async (toolCallId, params, signal, onUpdate) => {
            const cleanId = params.arxivId
                .replace('https://arxiv.org/abs/', '')
                .replace('https://arxiv.org/pdf/', '')
                .trim()

            const tmpDir = path.join(TEMP_DIR, cleanId)
            if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true })
            fs.mkdirSync(tmpDir, { recursive: true })

            const tarPath = path.join(tmpDir, `${cleanId}.tar.gz`)
            const url = `https://arxiv.org/e-print/${cleanId}`

            onUpdate?.({ content: [{ type: 'text', text: `Downloading ${url}...` }] })
            execSync(`curl -L -s -o "${tarPath}" "${url}"`, { timeout: 60000 })

            if (!fs.existsSync(tarPath) || fs.statSync(tarPath).size < 100) {
                throw new Error(`Failed to download arXiv source for ${cleanId}`)
            }

            onUpdate?.({ content: [{ type: 'text', text: 'Extracting...' }] })
            execSync(`tar xzf "${tarPath}" -C "${tmpDir}" 2>/dev/null || true`, { timeout: 30000 })

            // List all files recursively
            const allFiles = []
            function walk(dir, prefix = '') {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
                    if (entry.isDirectory()) {
                        walk(path.join(dir, entry.name), rel)
                    } else {
                        const size = fs.statSync(path.join(dir, entry.name)).size
                        allFiles.push({ path: rel, size })
                    }
                }
            }
            walk(tmpDir)

            // Find main TeX file
            const texFiles = allFiles.filter(f => f.path.endsWith('.tex'))
            let mainTexFile = null
            for (const f of texFiles) {
                const content = fs.readFileSync(path.join(tmpDir, f.path), 'utf-8')
                if (content.includes('\\documentclass') || content.includes('\\begin{document}')) {
                    mainTexFile = f.path
                    break
                }
            }
            if (!mainTexFile && texFiles.length > 0) {
                texFiles.sort((a, b) => b.size - a.size)
                mainTexFile = texFiles[0].path
            }

            const summary = [
                `Extracted to: ${tmpDir}`,
                `Total files: ${allFiles.length}`,
                `TeX files: ${texFiles.map(f => f.path).join(', ')}`,
                `Main TeX: ${mainTexFile || 'not found'}`,
                '',
                'All files:',
                ...allFiles.map(f => `  ${f.path} (${f.size} bytes)`),
            ].join('\n')

            return {
                content: [{ type: 'text', text: summary }],
                details: { extractDir: tmpDir, mainTexFile, fileCount: allFiles.length },
            }
        },
    }
}

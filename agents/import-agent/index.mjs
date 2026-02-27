/**
 * agent/index.mjs — LLM-native paper import agent
 *
 * Uses @mariozechner/pi-agent-core to drive the full import loop:
 *   download → read TeX → extract figures → convert to HTML → write metadata
 *
 * CLI:   node agent/index.mjs 1706.03762
 * API:   import { importPaperWithAgent } from './agent/index.mjs'
 */

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Agent } from '@mariozechner/pi-agent-core'
import { getModel, getEnvApiKey } from '@mariozechner/pi-ai'

// Tools
import createDownloadArxiv from './tools/download-arxiv.mjs'
import createReadFile from './tools/read-file.mjs'
import createWriteFile from './tools/write-file.mjs'
import createRenderKatex from './tools/render-katex.mjs'
import createBash from './tools/bash.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_DIR = path.resolve(__dirname, '..', '..')
const DOCS_DIR = path.join(PROJECT_DIR, 'docs')

// ── Load soul template ──
function loadSoul(arxivId) {
    const soulPath = path.join(__dirname, 'prompts', 'paper-agent-soul.md')
    let content = fs.readFileSync(soulPath, 'utf-8')
    const slug = arxivId.replace(/\./g, '-')
    content = content.replaceAll('{{docsDir}}', DOCS_DIR)
    content = content.replaceAll('{{slug}}', slug)
    return content
}

// ── Create agent ──
function createPaperAgent(arxivId) {
    const provider = process.env.PI_PROVIDER || 'anthropic'
    const modelId = process.env.PI_MODEL || 'claude-sonnet-4-6'

    const model = getModel(provider, modelId)
    const workspaceDir = PROJECT_DIR

    const tools = [
        createDownloadArxiv({ workspaceDir }),
        createReadFile({ workspaceDir }),
        createWriteFile({ workspaceDir }),
        createRenderKatex({ workspaceDir }),
        createBash({ workspaceDir }),
    ]

    const systemPrompt = loadSoul(arxivId)

    const agent = new Agent({
        initialState: {
            systemPrompt,
            model,
            tools,
            thinkingLevel: 'off',
        },
        getApiKey: (p) => getEnvApiKey(p),
    })

    return agent
}

// ── Public API ──

/**
 * Import an arXiv paper using the LLM-native agent pipeline.
 * @param {string} arxivId - arXiv paper ID (e.g. "1706.03762")
 * @param {function} onProgress - optional progress callback
 * @returns {Promise<{id: string, path: string}>}
 */
export async function importPaperWithAgent(arxivId, onProgress) {
    const progress = onProgress || ((msg) => console.log(`  → ${msg}`))
    const slug = arxivId.replace(/\./g, '-')
    const outputDir = path.join(DOCS_DIR, slug)

    progress('Starting agent pipeline...')
    const agent = createPaperAgent(arxivId)

    // ── JSONL logging ──
    const runTs = new Date().toISOString().replace(/[:.]/g, '-')
    const logFile = path.join(outputDir, `llm-log-${runTs}.jsonl`)
    fs.mkdirSync(outputDir, { recursive: true })
    const logStream = fs.createWriteStream(logFile, { flags: 'a' })
    const provider = process.env.PI_PROVIDER || 'anthropic'
    const modelId = process.env.PI_MODEL || 'claude-sonnet-4-6'
    let turnIndex = 0
    let turnStartTime = null

    function logEntry(entry) {
        logStream.write(JSON.stringify(entry) + '\n')
    }

    logEntry({
        event: 'run_start',
        ts: new Date().toISOString(),
        arxivId,
        provider,
        model: modelId,
        outputDir,
    })

    // Subscribe to events for progress reporting + logging
    agent.subscribe((event) => {
        if (event.type === 'turn_start') {
            turnIndex++
            turnStartTime = new Date().toISOString()
            logEntry({ event: 'turn_start', ts: turnStartTime, turn: turnIndex })
        }
        if (event.type === 'tool_execution_start') {
            progress(`🔧 ${event.toolName}(${JSON.stringify(event.args).substring(0, 80)}...)`)
            logEntry({
                event: 'tool_call',
                ts: new Date().toISOString(),
                turn: turnIndex,
                tool: event.toolName,
                args: event.args,
            })
        }
        if (event.type === 'message_end' && event.message) {
            logEntry({
                event: 'message',
                ts: new Date().toISOString(),
                turn: turnIndex,
                role: event.message.role,
                content: event.message.content,
            })
        }
        if (event.type === 'turn_end') {
            progress(`Turn complete.`)
            logEntry({
                event: 'turn_end',
                ts: new Date().toISOString(),
                turn: turnIndex,
                turnStartedAt: turnStartTime,
                durationMs: turnStartTime ? Date.now() - new Date(turnStartTime).getTime() : null,
            })
        }
    })

    // Prompt the agent
    const prompt = `Import the arXiv paper with ID: ${arxivId}

Please download the TeX source, read the paper, extract all figures, and convert the entire paper to annotated HTML with KaTeX-rendered math and variable annotations.

Write the output to: ${outputDir}/

Remember:
- Use render_katex for ALL math expressions
- Annotate ALL mathematical variables with <span class="var">
- Copy ALL figures to the figures/ subdirectory
- Write paper.html and metadata.yaml`

    try {
        await agent.prompt(prompt)
        progress('Agent pipeline complete!')

        // Check outputs
        const htmlPath = path.join(outputDir, 'paper.html')
        const metaPath = path.join(outputDir, 'metadata.yaml')
        const hasHtml = fs.existsSync(htmlPath)
        const hasMeta = fs.existsSync(metaPath)

        if (!hasHtml) {
            throw new Error('Agent did not produce paper.html')
        }

        logEntry({ event: 'run_end', ts: new Date().toISOString(), turns: turnIndex, success: true })
        logStream.end()
        progress(`📝 LLM log: ${logFile}`)

        return {
            id: slug,
            filename: 'paper.html',
            path: htmlPath,
            hasMetadata: hasMeta,
            outputDir,
        }
    } catch (err) {
        logEntry({ event: 'run_end', ts: new Date().toISOString(), turns: turnIndex, success: false, error: err.message })
        logStream.end()
        progress(`❌ Agent error: ${err.message}`)
        throw err
    }
}

// ── CLI ──
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    const arxivId = process.argv[2]
    if (!arxivId) {
        console.error('Usage: node agent/index.mjs <arxiv-id>')
        console.error('  e.g.: node agent/index.mjs 1706.03762')
        console.error('  e.g.: node agent/index.mjs 2510.18121')
        console.error('')
        console.error('Environment:')
        console.error('  ANTHROPIC_API_KEY  — required (or set PI_PROVIDER + API key)')
        console.error('  PI_PROVIDER        — LLM provider (default: anthropic)')
        console.error('  PI_MODEL           — model ID (default: claude-sonnet-4-6)')
        process.exit(1)
    }

    console.log(`\n📖 Paper Agent — Importing ${arxivId}\n`)
    importPaperWithAgent(arxivId).then(result => {
        console.log('\n✅ Import complete!')
        console.log(JSON.stringify(result, null, 2))
    }).catch(err => {
        console.error('\n❌ Import failed:', err.message)
        process.exit(1)
    })
}

// ── Tool: write_file ── Write content to a file
import fs from 'fs'
import path from 'path'
import { Type } from '@sinclair/typebox'

export default function createWriteFile(ctx = {}) {
    const { workspaceDir } = ctx
    return {
        name: 'write_file',
        description: 'Write text content to a file. Creates parent directories automatically. Use this to write paper.html, metadata.yaml, and any other output files.',
        label: 'Write File',
        parameters: Type.Object({
            path: Type.String({ description: 'File path (absolute or relative to workspace)' }),
            content: Type.String({ description: 'Full file content to write' }),
        }),
        execute: async (toolCallId, params) => {
            const fullPath = workspaceDir
                ? path.resolve(workspaceDir, params.path)
                : path.resolve(params.path)

            fs.mkdirSync(path.dirname(fullPath), { recursive: true })
            fs.writeFileSync(fullPath, params.content)

            return {
                content: [{ type: 'text', text: `Wrote ${params.content.length} bytes to ${params.path}` }],
                details: { path: params.path, size: params.content.length },
            }
        },
    }
}

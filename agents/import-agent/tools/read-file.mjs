// ── Tool: read_file ── Read file contents
import fs from 'fs'
import path from 'path'
import { Type } from '@sinclair/typebox'

export default function createReadFile(ctx = {}) {
    const { workspaceDir } = ctx
    return {
        name: 'read_file',
        description: 'Read the contents of a text file. For large files, use offset/limit to read in chunks. Returns the file content as text.',
        label: 'Read File',
        parameters: Type.Object({
            path: Type.String({ description: 'File path (absolute or relative to workspace)' }),
            offset: Type.Optional(Type.Number({ description: 'Start line, 1-indexed (default: 1)' })),
            limit: Type.Optional(Type.Number({ description: 'Max lines to return (default: all)' })),
        }),
        execute: async (toolCallId, params) => {
            const fullPath = workspaceDir
                ? path.resolve(workspaceDir, params.path)
                : path.resolve(params.path)

            if (!fs.existsSync(fullPath)) {
                throw new Error(`File not found: ${fullPath}`)
            }

            const content = fs.readFileSync(fullPath, 'utf-8')
            const lines = content.split('\n')
            const offset = (params.offset || 1) - 1
            const limit = params.limit || lines.length
            const sliced = lines.slice(offset, offset + limit).join('\n')

            return {
                content: [{ type: 'text', text: sliced }],
                details: { path: params.path, totalLines: lines.length, returnedLines: Math.min(limit, lines.length - offset) },
            }
        },
    }
}

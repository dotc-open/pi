import { spawn } from 'node:child_process'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

export default function (pi: ExtensionAPI) {
  // Settings become available only after Pi binds the extension runtime.
  pi.on('session_start', () => {
    const configuration: unknown = (pi.getSettings() as { runNpmScript?: unknown }).runNpmScript
    if (
      configuration !== undefined &&
      (configuration === null || typeof configuration !== 'object' || Array.isArray(configuration))
    ) {
      throw new Error('runNpmScript must be an object')
    }

    const configuredScripts = (configuration as { validScripts?: unknown } | undefined)?.validScripts
    if (
      configuredScripts !== undefined &&
      (!Array.isArray(configuredScripts) ||
        !configuredScripts.every((script: unknown) => typeof script === 'string' && script.length > 0))
    ) {
      throw new Error('runNpmScript.validScripts must be an array of non-empty strings')
    }

    const validScripts: string[] = configuredScripts === undefined ? [] : (configuredScripts as string[])
    const commands = new Map<string, string[]>()
    for (const script of validScripts) {
      // Accept only plain whitespace-separated argv tokens, not shell syntax or quoted arguments.
      if (!/^[\w@./:=+-]+(?:[ \t]+[\w@./:=+-]+)*$/.test(script)) {
        throw new Error(`Unsupported runNpmScript.validScripts entry: "${script}"`)
      }
      commands.set(script, script.split(/[ \t]+/))
    }

    const guidance = validScripts.length
      ? validScripts.join(', ')
      : 'none configured (set runNpmScript.validScripts in Pi settings)'

    pi.registerTool({
      name: 'run_npm_script',
      label: 'Run NPM Script',
      description: `Run an allowlisted pnpm command in the current working directory. Permitted commands: ${guidance}.`,
      parameters: Type.Object(
        {
          script: Type.String({
            description: `The exact pnpm command to run. Must be one of: ${guidance}`,
          }),
        },
        { additionalProperties: false },
      ),
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        const script = params.script

        const argv = commands.get(script)
        if (!argv) {
          return {
            content: [{ type: 'text', text: `Invalid script: "${script}". Must be one of: ${guidance}` }],
            details: {},
            isError: true,
          }
        }

        try {
          const output = await new Promise<{
            stdout: string
            stderr: string
            code: number | null
            error: Error | undefined
          }>((resolve) => {
            const proc = spawn('pnpm', argv, { cwd: ctx.cwd, shell: false, signal })
            let stdout = ''
            let stderr = ''
            let error: Error | undefined
            proc.stdout.on('data', (data: Buffer) => {
              stdout += data.toString()
            })
            proc.stderr.on('data', (data: Buffer) => {
              stderr += data.toString()
            })
            proc.on('error', (cause) => {
              error = cause
            })
            proc.on('close', (code) => {
              resolve({ stdout, stderr, code, error })
            })
          })

          if (output.code === 0 && !output.error && !signal?.aborted) {
            return { content: [{ type: 'text', text: output.stdout }], details: {} }
          }
          return {
            content: [
              {
                type: 'text',
                text:
                  (signal?.aborted ? output.error?.message || 'pnpm command aborted' : undefined) ||
                  [output.stdout.trim(), output.stderr.trim()].filter(Boolean).join('\n') ||
                  output.error?.message ||
                  `pnpm exited with code ${output.code}`,
              },
            ],
            details: {},
            isError: true,
          }
        } catch (error) {
          return { content: [{ type: 'text', text: String(error) }], details: {}, isError: true }
        }
      },
    })
  })
}

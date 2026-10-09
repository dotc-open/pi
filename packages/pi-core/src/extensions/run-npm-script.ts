import { spawn } from 'node:child_process'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

export default function (pi: ExtensionAPI) {
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
  // Until execution uses argv, permit only shell-inert tokens (no quoting, expansion, or redirection).
  for (const script of validScripts) {
    if (!/^[\w@./:=+-]+(?:[ \t]+[\w@./:=+-]+)*$/.test(script)) {
      throw new Error(`Unsupported runNpmScript.validScripts entry: "${script}"`)
    }
  }

  const guidance = validScripts.length
    ? validScripts.join(', ')
    : 'none configured (set runNpmScript.validScripts in Pi settings)'

  pi.registerTool({
    name: 'run_npm_script',
    label: 'Run NPM Script',
    description: `Run an allowlisted pnpm command in the current working directory. Permitted commands: ${guidance}.`,
    parameters: Type.Object({
      script: Type.String({
        description: `The exact pnpm command to run. Must be one of: ${guidance}`,
      }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const script = params.script

      if (!validScripts.includes(script)) {
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
          const proc = spawn('pnpm', script.split(/[ \t]+/), { cwd: ctx.cwd, shell: false, signal })
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

        if (output.code === 0 && !output.error) {
          return { content: [{ type: 'text', text: output.stdout }], details: {} }
        }
        return {
          content: [
            {
              type: 'text',
              text:
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
}

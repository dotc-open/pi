import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DEFAULT_KEY_NAME = 'default'

const KEY_VAR_PREFIX = 'PLATFORM_AI_API_KEY'
const SETTING_NAME = 'platformAiApiKey'

export type Env = Record<string, string | undefined>

export interface ActiveKey {
  /** Key name in use after fallback resolution. */
  name: string
  /** Environment variable holding the key value, when it exists. */
  envVar: string | undefined
  /** True when the requested name was unavailable and `default` was used. */
  fellBack: boolean
}

/** Key names are discovered by convention: `PLATFORM_AI_API_KEY` is `default`, `<PREFIX>_<NAME>` is `<name>`. */
export function discoverKeyVars(env: Env): Map<string, string> {
  const vars = new Map<string, string>()

  for (const [envVar, value] of Object.entries(env)) {
    if (!value) continue

    if (envVar === KEY_VAR_PREFIX) {
      vars.set(DEFAULT_KEY_NAME, envVar)
      continue
    }

    if (!envVar.startsWith(`${KEY_VAR_PREFIX}_`)) continue

    const name = envVar
      .slice(KEY_VAR_PREFIX.length + 1)
      .toLowerCase()
      .replaceAll('_', '-')
    if (!name || name === DEFAULT_KEY_NAME) continue

    vars.set(name, envVar)
  }

  return vars
}

export function parseKeyName(settingsText: string): string | undefined {
  let settings: unknown
  try {
    settings = JSON.parse(settingsText)
  } catch {
    return undefined
  }

  if (typeof settings !== 'object' || settings === null) return undefined

  const value = (settings as Record<string, unknown>)[SETTING_NAME]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function readKeyNameFromSettings(filePath: string): string | undefined {
  try {
    return parseKeyName(readFileSync(filePath, 'utf8'))
  } catch {
    return undefined
  }
}

export function getAgentDir(env: Env): string {
  return env['PI_CODING_AGENT_DIR'] || join(homedir(), '.pi', 'agent')
}

/** Project settings win over user settings; a project value is honoured even when the project is untrusted. */
export function resolveStartingKeyName(cwd: string, env: Env): string {
  return (
    readKeyNameFromSettings(join(cwd, '.pi', 'settings.json')) ??
    readKeyNameFromSettings(join(getAgentDir(env), 'settings.json')) ??
    DEFAULT_KEY_NAME
  )
}

export function resolveActiveKey(name: string, vars: ReadonlyMap<string, string>): ActiveKey {
  const envVar = vars.get(name)
  if (envVar) return { name, envVar, fellBack: false }

  if (name === DEFAULT_KEY_NAME) return { name, envVar: undefined, fellBack: false }

  return { name: DEFAULT_KEY_NAME, envVar: vars.get(DEFAULT_KEY_NAME), fellBack: true }
}

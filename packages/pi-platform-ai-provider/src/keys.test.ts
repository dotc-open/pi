import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_KEY_NAME,
  discoverKeyVars,
  getAgentDir,
  parseKeyName,
  readKeyNameFromSettings,
  resolveActiveKey,
  resolveStartingKeyName,
} from './keys'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pi-platform-ai-keys-'))
  tempDirs.push(dir)
  return dir
}

function writeFileAt(filePath: string, contents: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, contents)
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('discoverKeyVars', () => {
  it('maps the unsuffixed variable to default', () => {
    expect(discoverKeyVars({ PLATFORM_AI_API_KEY: 'a' })).toEqual(new Map([[DEFAULT_KEY_NAME, 'PLATFORM_AI_API_KEY']]))
  })

  it('maps suffixed variables alongside default', () => {
    expect(
      discoverKeyVars({
        PLATFORM_AI_API_KEY: 'a',
        PLATFORM_AI_API_KEY_PERSONAL: 'b',
      }),
    ).toEqual(
      new Map([
        [DEFAULT_KEY_NAME, 'PLATFORM_AI_API_KEY'],
        ['personal', 'PLATFORM_AI_API_KEY_PERSONAL'],
      ]),
    )
  })

  it('lowercases and hyphenates the suffix', () => {
    expect([...discoverKeyVars({ PLATFORM_AI_API_KEY_PROJECT_A: 'a' }).keys()]).toEqual(['project-a'])
  })

  it('hyphenates every underscore in a multi-word suffix', () => {
    expect([...discoverKeyVars({ PLATFORM_AI_API_KEY_TEAM_PROJECT_A: 'a' }).keys()]).toEqual(['team-project-a'])
  })

  it('ignores an empty suffix', () => {
    expect(discoverKeyVars({ PLATFORM_AI_API_KEY_: 'a' }).size).toBe(0)
  })

  it('ignores a suffix naming default', () => {
    expect(discoverKeyVars({ PLATFORM_AI_API_KEY_DEFAULT: 'a' }).size).toBe(0)
  })

  it('treats an empty value as missing', () => {
    expect(discoverKeyVars({ PLATFORM_AI_API_KEY: '', PLATFORM_AI_API_KEY_PERSONAL: '' }).size).toBe(0)
  })

  it('ignores unrelated variables', () => {
    expect(discoverKeyVars({ PLATFORM_API_KEY: 'a', PLATFORM_AI_MODEL: 'b', PATH: 'c' }).size).toBe(0)
  })
})

describe('parseKeyName', () => {
  it('returns the configured name', () => {
    expect(parseKeyName('{"platformAiApiKey":"project-a"}')).toBe('project-a')
  })

  it('ignores a non-string value', () => {
    expect(parseKeyName('{"platformAiApiKey":42}')).toBeUndefined()
    expect(parseKeyName('{"platformAiApiKey":null}')).toBeUndefined()
  })

  it('ignores an empty string', () => {
    expect(parseKeyName('{"platformAiApiKey":""}')).toBeUndefined()
  })

  it('ignores malformed JSON and non-object JSON', () => {
    expect(parseKeyName('not json')).toBeUndefined()
    expect(parseKeyName('"project-a"')).toBeUndefined()
  })
})

describe('readKeyNameFromSettings', () => {
  it('reads the name from a settings file', () => {
    const file = join(makeTempDir(), 'settings.json')
    writeFileAt(file, '{"platformAiApiKey":"project-a"}')

    expect(readKeyNameFromSettings(file)).toBe('project-a')
  })

  it('ignores a missing file', () => {
    expect(readKeyNameFromSettings(join(makeTempDir(), 'settings.json'))).toBeUndefined()
  })

  it('ignores a malformed file', () => {
    const file = join(makeTempDir(), 'settings.json')
    writeFileAt(file, '{')

    expect(readKeyNameFromSettings(file)).toBeUndefined()
  })
})

describe('getAgentDir', () => {
  it('defaults to the Pi agent directory', () => {
    expect(getAgentDir({})).toBe(join(homedir(), '.pi', 'agent'))
  })

  it('prefers PI_CODING_AGENT_DIR', () => {
    expect(getAgentDir({ PI_CODING_AGENT_DIR: '/custom' })).toBe('/custom')
  })
})

describe('resolveStartingKeyName', () => {
  it('defaults when no settings file names a key', () => {
    expect(resolveStartingKeyName(makeTempDir(), { PI_CODING_AGENT_DIR: makeTempDir() })).toBe(DEFAULT_KEY_NAME)
  })

  it('reads the project settings file', () => {
    const cwd = makeTempDir()
    writeFileAt(join(cwd, '.pi', 'settings.json'), '{"platformAiApiKey":"project-a"}')

    expect(resolveStartingKeyName(cwd, { PI_CODING_AGENT_DIR: makeTempDir() })).toBe('project-a')
  })

  it('reads the user settings file', () => {
    const agentDir = makeTempDir()
    writeFileAt(join(agentDir, 'settings.json'), '{"platformAiApiKey":"personal"}')

    expect(resolveStartingKeyName(makeTempDir(), { PI_CODING_AGENT_DIR: agentDir })).toBe('personal')
  })

  it('lets the project value win over the user value', () => {
    const cwd = makeTempDir()
    const agentDir = makeTempDir()
    writeFileAt(join(agentDir, 'settings.json'), '{"platformAiApiKey":"personal"}')
    writeFileAt(join(cwd, '.pi', 'settings.json'), '{"platformAiApiKey":"project-a"}')

    expect(resolveStartingKeyName(cwd, { PI_CODING_AGENT_DIR: agentDir })).toBe('project-a')
  })
})

describe('resolveActiveKey', () => {
  const vars = new Map([
    [DEFAULT_KEY_NAME, 'PLATFORM_AI_API_KEY'],
    ['personal', 'PLATFORM_AI_API_KEY_PERSONAL'],
  ])

  it('resolves a present name without falling back', () => {
    expect(resolveActiveKey('personal', vars)).toEqual({
      name: 'personal',
      envVar: 'PLATFORM_AI_API_KEY_PERSONAL',
      fellBack: false,
    })
  })

  it('falls back to default when the name is absent', () => {
    expect(resolveActiveKey('project-a', vars)).toEqual({
      name: DEFAULT_KEY_NAME,
      envVar: 'PLATFORM_AI_API_KEY',
      fellBack: true,
    })
  })

  it('yields no variable when neither the name nor default exists', () => {
    expect(resolveActiveKey('project-a', new Map())).toEqual({
      name: DEFAULT_KEY_NAME,
      envVar: undefined,
      fellBack: true,
    })
  })
})

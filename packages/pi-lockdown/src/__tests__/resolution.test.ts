import type * as nodeFs from 'node:fs'
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@earendil-works/pi-coding-agent', () => ({
  SettingsManager: { create: () => ({ getProjectSettings: () => ({}), getGlobalSettings: () => ({}) }) },
  getPackageDir: () => '/pi-package',
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof nodeFs
  return { ...actual, realpathSync: vi.fn(actual.realpathSync) }
})

import { realpathSync as mockedRealpathSync } from 'node:fs'

import { evaluateFilePath, normalizeToolPath, type PathPolicy } from '../path-policy'

function makeProject(): { base: string; cwd: string; external: string } {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'lockdown-resolve-')))
  const cwd = path.join(base, 'project')
  const external = path.join(base, 'external')
  mkdirSync(cwd, { recursive: true })
  mkdirSync(external, { recursive: true })
  return { base, cwd, external }
}

function policy(overrides: Partial<PathPolicy> = {}): PathPolicy {
  return { denyRead: [], allowRead: [], allowWrite: [], denyWrite: [], ...overrides }
}

afterEach(() => {
  vi.mocked(mockedRealpathSync).mockClear()
})

describe('normalization', () => {
  it('strips the @ prefix and normalizes .. and separators', () => {
    const { cwd } = makeProject()
    expect(normalizeToolPath(cwd, '@e2e/x.txt')).toBe(path.join(cwd, 'e2e', 'x.txt'))
    expect(normalizeToolPath(cwd, 'src/../e2e/x.txt')).toBe(path.join(cwd, 'e2e', 'x.txt'))
  })
})

describe('requested vs canonical target', () => {
  it('does not let an external symlink inherit the allowed path', () => {
    const { cwd, external } = makeProject()
    symlinkSync(external, path.join(cwd, 'e2e'), 'dir')

    const p = policy({ allowWrite: ['e2e/'], denyWrite: [':external'] })
    const decision = evaluateFilePath(p, cwd, path.join(cwd, 'e2e', 'new.txt'), 'write')

    expect(decision.outcome).toBe('block')
    expect(decision.target).toBe(path.join(external, 'new.txt'))
  })

  it('does not let a new file under a symlinked parent escape an allowed area', () => {
    const { cwd, external } = makeProject()
    symlinkSync(external, path.join(cwd, 'e2e'), 'dir')

    const p = policy({ allowWrite: ['e2e/'], denyWrite: [':external'] })
    expect(evaluateFilePath(p, cwd, '@e2e/fixtures/new.json', 'write').outcome).toBe('block')
  })

  it('does not let a symlink to a denied internal directory bypass the deny', () => {
    const { cwd } = makeProject()
    mkdirSync(path.join(cwd, '.git'))
    symlinkSync(path.join(cwd, '.git'), path.join(cwd, 'link'), 'dir')

    const p = policy({ allowWrite: ['.'], denyWrite: ['**/.git/**'] })
    const decision = evaluateFilePath(p, cwd, path.join(cwd, 'link', 'config'), 'write')

    expect(decision.outcome).toBe('block')
    expect(decision.target).toBe(path.join(cwd, '.git', 'config'))
  })

  it('allows a write when both the requested path and target are allowed', () => {
    const { cwd } = makeProject()
    const p = policy({ allowWrite: ['.'] })
    expect(evaluateFilePath(p, cwd, path.join(cwd, 'src', 'new.ts'), 'write').outcome).toBe('allow')
  })
})

describe('safe path resolution', () => {
  it('fails closed when the target cannot be resolved', () => {
    const { cwd } = makeProject()
    const original = vi.mocked(mockedRealpathSync).getMockImplementation()
    vi.mocked(mockedRealpathSync).mockImplementation(() => {
      throw new Error('boom')
    })

    const decision = evaluateFilePath(policy({ allowWrite: ['.'] }), cwd, path.join(cwd, 'e2e', 'x'), 'write')
    expect(decision.outcome).toBe('block')

    if (original) vi.mocked(mockedRealpathSync).mockImplementation(original)
  })
})

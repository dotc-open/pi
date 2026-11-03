import { mkdtempSync, realpathSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@earendil-works/pi-coding-agent', () => ({
  SettingsManager: { create: () => ({ getProjectSettings: () => ({}), getGlobalSettings: () => ({}) }) },
  getPackageDir: () => '/pi-package',
}))

import { evaluateFilePath, type PathPolicy } from '../path-policy'

const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'lockdown-policy-')))

function policy(overrides: Partial<PathPolicy> = {}): PathPolicy {
  return { denyRead: [], allowRead: [], allowWrite: [], denyWrite: [], ...overrides }
}

describe('tokens', () => {
  it('"." matches the project and everything under it', () => {
    const p = policy({ allowRead: ['.'] })
    expect(evaluateFilePath(p, cwd, path.join(cwd, 'src', 'a.ts'), 'read').outcome).toBe('allow')
    expect(evaluateFilePath(p, cwd, cwd, 'read').outcome).toBe('allow')
  })

  it('"~" expands to the home directory', () => {
    const p = policy({ allowRead: ['~/.secrets'] })
    const decision = evaluateFilePath(p, cwd, '~/.secrets', 'read')
    expect(decision.outcome).toBe('allow')
    expect(decision.requested).toBe(path.join(homedir(), '.secrets'))
  })

  it('":external" matches paths outside the project only for writes', () => {
    const p = policy({ denyWrite: [':external'] })
    expect(evaluateFilePath(p, cwd, path.join(path.dirname(cwd), 'outside.txt'), 'write').outcome).toBe('block')
    expect(evaluateFilePath(p, cwd, path.join(cwd, 'inside.txt'), 'write').outcome).toBe('prompt')
  })

  it('"*" blocks everything not carved out by a more specific allow', () => {
    const p = policy({ allowWrite: ['e2e/'], denyWrite: ['*'] })
    expect(evaluateFilePath(p, cwd, path.join(cwd, 'e2e', 'x.txt'), 'write').outcome).toBe('allow')
    expect(evaluateFilePath(p, cwd, path.join(cwd, 'src', 'x.txt'), 'write').outcome).toBe('block')
  })
})

describe('matching', () => {
  it('uses directory, exact file and glob classification', () => {
    expect(evaluateFilePath(policy({ allowWrite: ['e2e/'] }), cwd, path.join(cwd, 'e2e', 'x'), 'write').outcome).toBe(
      'allow',
    )
    expect(
      evaluateFilePath(policy({ allowWrite: [path.join(cwd, 'a.pem')] }), cwd, path.join(cwd, 'a.pem'), 'write')
        .outcome,
    ).toBe('allow')
    expect(
      evaluateFilePath(policy({ allowWrite: ['**/*.pem'] }), cwd, path.join(cwd, 'dir', 'a.pem'), 'write').outcome,
    ).toBe('allow')
  })

  it('scopes "*" to a single segment, "**" spans directories', () => {
    expect(evaluateFilePath(policy({ allowWrite: ['*.pem'] }), cwd, path.join(cwd, 'a.pem'), 'write').outcome).toBe(
      'allow',
    )
    expect(
      evaluateFilePath(policy({ allowWrite: ['*.pem'] }), cwd, path.join(cwd, 'dir', 'a.pem'), 'write').outcome,
    ).toBe('prompt')
    expect(
      evaluateFilePath(policy({ allowWrite: ['**/*.pem'] }), cwd, path.join(cwd, 'dir', 'a.pem'), 'write').outcome,
    ).toBe('allow')
  })

  it('matches root-level and nested globs', () => {
    const p = policy({ denyRead: ['**/.env*'] })
    expect(evaluateFilePath(p, cwd, path.join(cwd, '.env'), 'read').outcome).toBe('prompt')
    expect(evaluateFilePath(p, cwd, path.join(cwd, 'nested', '.env'), 'read').outcome).toBe('prompt')
  })

  it('does not treat a sibling prefix as a directory match', () => {
    const p = policy({ allowWrite: ['e2e/'] })
    expect(evaluateFilePath(p, cwd, path.join(cwd, 'e2e-other', 'x'), 'write').outcome).toBe('prompt')
  })

  it('returns prompt when nothing matches', () => {
    expect(evaluateFilePath(policy(), cwd, path.join(cwd, 'src', 'a.ts'), 'read').outcome).toBe('prompt')
  })
})

describe('specificity', () => {
  it('ranks a glob above a directory prefix', () => {
    const p = policy({ allowRead: ['.'], denyRead: ['**/.env*'] })
    expect(evaluateFilePath(p, cwd, path.join(cwd, '.env'), 'read').outcome).toBe('prompt')
    expect(evaluateFilePath(p, cwd, path.join(cwd, 'src', 'a.ts'), 'read').outcome).toBe('allow')
  })

  it('ranks a longer literal glob above a shorter one', () => {
    const p = policy({ allowRead: ['.', './**/.env.development'], denyRead: ['**/.env*'] })
    expect(evaluateFilePath(p, cwd, path.join(cwd, '.env.development'), 'read').outcome).toBe('allow')
    expect(evaluateFilePath(p, cwd, path.join(cwd, '.env'), 'read').outcome).toBe('prompt')
  })

  it('ranks an exact file above a glob', () => {
    const p = policy({ allowWrite: [path.join(cwd, 'a.pem')], denyWrite: ['**/*.pem'] })
    expect(evaluateFilePath(p, cwd, path.join(cwd, 'a.pem'), 'write').outcome).toBe('allow')
  })

  it('lets deny win an exact tie', () => {
    const p = policy({ allowRead: ['**/a*'], denyRead: ['**/*a'] })
    const decision = evaluateFilePath(p, cwd, path.join(cwd, 'aa'), 'read')
    expect(decision.outcome).toBe('prompt')
    expect(decision.rule).toBe('**/*a')
  })

  it('reports the winning deny rule', () => {
    const p = policy({ denyWrite: ['**/.env*'] })
    expect(evaluateFilePath(p, cwd, path.join(cwd, '.env'), 'write')).toMatchObject({
      outcome: 'block',
      rule: '**/.env*',
    })
  })
})

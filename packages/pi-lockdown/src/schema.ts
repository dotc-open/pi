import z from 'zod'

export const lockdownLevelOptions = ['allow', 'warn', 'block']
export const LockdownLevelSchema = z.enum(lockdownLevelOptions)
export type LockdownLevel = z.infer<typeof LockdownLevelSchema>

const defaultTools = ['read', 'edit', 'write', 'grep', 'find', 'ls'] as const
export const DefaultToolsSchema = z.array(z.enum(defaultTools))

export const DEFAULT_PROTECTED_PATTERNS = ['**/.env*', '**/.git/**', '**/node_modules/**']

// Shared between both modes.
const commonFields = {
  defaultTools: DefaultToolsSchema.default([...defaultTools]),
  customTools: z.record(z.string(), LockdownLevelSchema).default({}),
}

// The legacy `fileAccess` matrix. `fileAccess` stays required so existing
// configs keep parsing exactly as before.
export const LegacyLockdownSettingsSchema = z.object({
  ...commonFields,
  protectedPatterns: z.array(z.string()).default([...DEFAULT_PROTECTED_PATTERNS]),
  fileAccess: z.object({
    external: z.object({
      protected: z.object({
        read: LockdownLevelSchema.default('block'),
        write: LockdownLevelSchema.default('block'),
        edit: LockdownLevelSchema.default('block'),
        other: LockdownLevelSchema.default('block'),
      }),
      unprotected: z.object({
        read: LockdownLevelSchema.default('allow'),
        write: LockdownLevelSchema.default('block'),
        edit: LockdownLevelSchema.default('block'),
        other: LockdownLevelSchema.default('block'),
      }),
    }),
    internal: z.object({
      protected: z.object({
        read: LockdownLevelSchema.default('warn'),
        write: LockdownLevelSchema.default('warn'),
        edit: LockdownLevelSchema.default('warn'),
        other: LockdownLevelSchema.default('warn'),
      }),
      unprotected: z.object({
        read: LockdownLevelSchema.default('allow'),
        write: LockdownLevelSchema.default('warn'),
        edit: LockdownLevelSchema.default('warn'),
        other: LockdownLevelSchema.default('warn'),
      }),
    }),
  }),
})
export type LegacyLockdownSettings = z.infer<typeof LegacyLockdownSettingsSchema>

// `denyRead`/`allowRead`/`allowWrite`/`denyWrite` — the path-list policy.
// In new mode they live under the same `fileAccess` key the legacy matrix uses.
export const PATH_POLICY_KEYS = ['denyRead', 'allowRead', 'allowWrite', 'denyWrite'] as const
export type PathPolicyKey = (typeof PATH_POLICY_KEYS)[number]
export const FILE_ACCESS_KEY = 'fileAccess' as const

// The legacy matrix keys. Their presence inside `fileAccess` selects legacy
// mode; mixing them with a path-policy key is a hard config error.
export const LEGACY_FILE_ACCESS_MATRIX_KEYS = ['external', 'internal'] as const

export const DEFAULT_PATH_POLICY = {
  denyRead: ['**/.env*'],
  allowRead: ['.', './**/.env.development'],
  allowWrite: [],
  denyWrite: ['**/.env*', '**/.git/**', '**/node_modules/**', ':external'],
} as const satisfies Record<PathPolicyKey, readonly string[]>

export const PathEntrySchema = z
  .string()
  .refine((entry) => entry.trim().length > 0, { message: 'Path entry must not be empty.' })

export const FileAccessPathSchema = z.object({
  denyRead: z.array(PathEntrySchema).default([...DEFAULT_PATH_POLICY.denyRead]),
  allowRead: z.array(PathEntrySchema).default([...DEFAULT_PATH_POLICY.allowRead]),
  allowWrite: z.array(PathEntrySchema).default([...DEFAULT_PATH_POLICY.allowWrite]),
  denyWrite: z.array(PathEntrySchema).default([...DEFAULT_PATH_POLICY.denyWrite]),
})

// Nested config, flat internal shape: the evaluator and session editor always
// read the four arrays from the top level.
export const PathPolicySettingsSchema = z
  .object({
    ...commonFields,
    fileAccess: FileAccessPathSchema.default({
      denyRead: [...DEFAULT_PATH_POLICY.denyRead],
      allowRead: [...DEFAULT_PATH_POLICY.allowRead],
      allowWrite: [...DEFAULT_PATH_POLICY.allowWrite],
      denyWrite: [...DEFAULT_PATH_POLICY.denyWrite],
    }),
  })
  .transform((value) => ({
    defaultTools: value.defaultTools,
    customTools: value.customTools,
    ...value.fileAccess,
  }))
export type PathPolicySettings = z.infer<typeof PathPolicySettingsSchema>

export type LockdownMode = 'legacy' | 'new'
export type LockdownSettings = (LegacyLockdownSettings & { mode: 'legacy' }) | (PathPolicySettings & { mode: 'new' })
export type LegacyModeSettings = Extract<LockdownSettings, { mode: 'legacy' }>

export function defaultLockdownSettings(): LockdownSettings {
  return {
    mode: 'legacy',
    ...LegacyLockdownSettingsSchema.parse({
      fileAccess: {
        external: { protected: {}, unprotected: {} },
        internal: { protected: {}, unprotected: {} },
      },
    }),
  }
}

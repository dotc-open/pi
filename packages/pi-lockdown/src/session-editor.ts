import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent'
import {
  type AutocompleteItem,
  CombinedAutocompleteProvider,
  type Component,
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui'

import { PATH_POLICY_KEYS, PathEntrySchema, type PathPolicyKey, type PathPolicySettings } from './schema'

const MAX_SUGGESTIONS = 8
const MAX_VISIBLE_ROWS = 10
const END_KEY = '\x1b[F'

/** Minimal surface the components need from the TUI. */
interface RenderHost {
  requestRender(): void
}

export interface ListEditResult {
  added: string[]
  removed: string[]
}

/** Removals first, then additions, skipping duplicates and already-present values. */
export function applyListEdits(entries: readonly string[], result: ListEditResult): string[] {
  const removed = new Set(result.removed)
  const next = entries.filter((entry) => !removed.has(entry))
  for (const entry of result.added) {
    if (!next.includes(entry)) next.push(entry)
  }
  return next
}

/** First screen: pick one of the four lists, showing its entries inline. */
export function createListChooser(
  settings: PathPolicySettings,
  theme: Theme,
  host: RenderHost,
  done: (key: PathPolicyKey | undefined) => void,
): Component {
  let index = 0
  let cached: string[] | undefined

  const refresh = () => {
    cached = undefined
    host.requestRender()
  }

  return {
    invalidate: () => {
      cached = undefined
    },
    render(width) {
      if (cached) return cached
      const lines: string[] = [
        theme.fg('accent', theme.bold('[LOCKDOWN] Session permissions')),
        theme.fg('dim', 'Choose a list to edit.'),
        '',
      ]
      PATH_POLICY_KEYS.forEach((key, i) => {
        const selected = i === index
        const prefix = selected ? '→ ' : '  '
        const label = `${key} (${settings[key].length})`
        let line = prefix + theme.fg(selected ? 'accent' : 'text', label)
        const detail = settings[key].join(', ')
        const detailWidth = width - visibleWidth(prefix) - visibleWidth(label) - 2
        if (detail && detailWidth > 4) {
          line += `  ${theme.fg('dim', truncateToWidth(detail, detailWidth, '...'))}`
        }
        lines.push(truncateToWidth(line, width, ''))
      })
      lines.push('')
      lines.push(theme.fg('dim', '↑↓ choose • Enter edit • Esc close'))
      cached = lines
      return lines
    },
    handleInput(data) {
      if (matchesKey(data, Key.up)) {
        index = (index - 1 + PATH_POLICY_KEYS.length) % PATH_POLICY_KEYS.length
        refresh()
        return
      }
      if (matchesKey(data, Key.down)) {
        index = (index + 1) % PATH_POLICY_KEYS.length
        refresh()
        return
      }
      if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
        done(PATH_POLICY_KEYS[index])
        return
      }
      if (matchesKey(data, Key.escape)) {
        done(undefined)
      }
    },
  }
}

interface EntryRow {
  value: string
  deleted: boolean
}

/**
 * Second screen: vertical list of entries with a trailing free-text row. The
 * delete key flags a row; the returned result is applied by the caller.
 */
export function createListEditor(
  key: PathPolicyKey,
  entries: readonly string[],
  cwd: string,
  theme: Theme,
  host: RenderHost,
  done: (result: ListEditResult | undefined) => void,
): Component {
  const rows: EntryRow[] = entries.map((value) => ({ value, deleted: false }))
  const input = new Input()
  const provider = new CombinedAutocompleteProvider(undefined, cwd)

  let index = rows.length
  let suggestions: AutocompleteItem[] = []
  let suggestionPrefix = ''
  let suggestionIndex = 0
  let error: string | undefined
  let requestId = 0
  let abort: AbortController | undefined
  let cached: string[] | undefined

  const invalidate = () => {
    cached = undefined
  }

  const refresh = () => {
    invalidate()
    host.requestRender()
  }

  const clearSuggestions = () => {
    suggestions = []
    suggestionPrefix = ''
    suggestionIndex = 0
  }

  const result = (): ListEditResult => ({
    added: rows.filter((row) => !row.deleted && !entries.includes(row.value)).map((row) => row.value),
    removed: rows.filter((row) => row.deleted).map((row) => row.value),
  })

  const refreshSuggestions = async () => {
    abort?.abort()
    const value = input.getValue()
    if (value.trim().length === 0) {
      clearSuggestions()
      refresh()
      return
    }
    const controller = new AbortController()
    abort = controller
    const id = ++requestId
    const found = await provider.getSuggestions([value], 0, value.length, {
      signal: controller.signal,
      force: true,
    })
    if (id !== requestId) return
    suggestions = found?.items ?? []
    suggestionPrefix = found?.prefix ?? ''
    suggestionIndex = 0
    refresh()
  }

  const applySuggestion = () => {
    const item = suggestions[suggestionIndex]
    if (!item) return
    const value = input.getValue()
    const applied = provider.applyCompletion([value], 0, value.length, item, suggestionPrefix)
    input.setValue(applied.lines[0] ?? value)
    input.handleInput(END_KEY)
    clearSuggestions()
    error = undefined
    refresh()
  }

  const commitInput = () => {
    const parsed = PathEntrySchema.safeParse(input.getValue().trim())
    if (!parsed.success) {
      error = parsed.error.issues[0]?.message ?? 'Invalid path entry.'
      refresh()
      return
    }
    if (!rows.some((row) => row.value === parsed.data)) {
      rows.push({ value: parsed.data, deleted: false })
    }
    input.setValue('')
    clearSuggestions()
    error = undefined
    index = rows.length
    refresh()
  }

  const component: Component & { focused: boolean } = {
    focused: false,
    invalidate,
    render(width) {
      if (cached) return cached
      input.focused = component.focused && index === rows.length
      const lines: string[] = [
        theme.fg('accent', theme.bold(`[LOCKDOWN] ${key}`)),
        theme.fg('dim', 'Del flags an entry for deletion. The last row adds a new entry.'),
        '',
      ]
      const totalRows = rows.length + 1
      const start = Math.max(0, Math.min(index - Math.floor(MAX_VISIBLE_ROWS / 2), totalRows - MAX_VISIBLE_ROWS))
      const end = Math.min(start + MAX_VISIBLE_ROWS, totalRows)
      for (let i = start; i < end; i += 1) {
        if (i < rows.length) {
          const row = rows[i]
          if (!row) continue
          const selected = i === index
          const prefix = selected ? theme.fg('accent', '→ ') : '  '
          const value = row.deleted
            ? theme.strikethrough(theme.fg('error', row.value))
            : theme.fg(selected ? 'accent' : 'text', row.value)
          const flag = row.deleted ? theme.fg('error', ' [delete]') : ''
          lines.push(truncateToWidth(`${prefix}${value}${flag}`, width, ''))
          continue
        }
        const inputSelected = i === index
        const inputPrefix = inputSelected ? theme.fg('accent', '→ ') : '  '
        // Input renders a hardcoded "> " prompt; drop it so the row uses our own prefix.
        const rendered = input.render(Math.max(1, width - visibleWidth(inputPrefix) + 2))[0] ?? ''
        const inputLine = rendered.startsWith('> ') ? rendered.slice(2) : rendered
        lines.push(truncateToWidth(`${inputPrefix}${inputLine}`, width, ''))
      }

      if (start > 0 || end < totalRows) {
        lines.push(theme.fg('dim', `  (${index + 1}/${totalRows})`))
      }

      if (index === rows.length && suggestions.length > 0) {
        suggestions.slice(0, MAX_SUGGESTIONS).forEach((item, i) => {
          const selected = i === suggestionIndex
          lines.push(truncateToWidth(`  ${theme.fg(selected ? 'accent' : 'dim', item.label)}`, width, ''))
        })
      }

      if (error) lines.push(theme.fg('error', error))
      lines.push('')
      lines.push(theme.fg('dim', '↑↓ navigate • Del flag • Enter add/save • Esc discard'))
      cached = lines
      return lines
    },
    handleInput(data) {
      if (matchesKey(data, Key.escape)) {
        if (suggestions.length > 0) {
          clearSuggestions()
          refresh()
          return
        }
        done(undefined)
        return
      }

      if (index === rows.length && suggestions.length > 0) {
        if (matchesKey(data, Key.up)) {
          suggestionIndex = (suggestionIndex - 1 + suggestions.length) % suggestions.length
          refresh()
          return
        }
        if (matchesKey(data, Key.down)) {
          suggestionIndex = (suggestionIndex + 1) % suggestions.length
          refresh()
          return
        }
        if (matchesKey(data, Key.tab)) {
          applySuggestion()
          return
        }
      }

      if (matchesKey(data, Key.up)) {
        index = Math.max(0, index - 1)
        clearSuggestions()
        refresh()
        return
      }
      if (matchesKey(data, Key.down)) {
        index = Math.min(rows.length, index + 1)
        clearSuggestions()
        refresh()
        return
      }

      if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
        if (input.getValue().trim().length === 0) {
          done(result())
          return
        }
        commitInput()
        return
      }

      if (index < rows.length) {
        if (matchesKey(data, Key.delete) || matchesKey(data, Key.backspace)) {
          const row = rows[index]
          if (row) row.deleted = !row.deleted
          refresh()
        }
        return
      }

      if (matchesKey(data, Key.tab)) {
        applySuggestion()
        return
      }

      input.handleInput(data)
      error = undefined
      void refreshSuggestions()
    },
  }

  return component
}

/** New-mode session editor: edit the four path lists for the current session only. */
export async function configureNewModeSession(ctx: ExtensionContext, settings: PathPolicySettings): Promise<void> {
  if (!ctx.hasUI) {
    ctx.ui.notify('[LOCKDOWN] Session permissions require an interactive UI.', 'error')
    return
  }

  while (true) {
    const key = await ctx.ui.custom<PathPolicyKey | undefined>((tui, theme, _kb, done) =>
      createListChooser(settings, theme, tui, done),
    )
    if (key === undefined) return

    const result = await ctx.ui.custom<ListEditResult | undefined>((tui, theme, _kb, done) =>
      createListEditor(key, settings[key], ctx.cwd, theme, tui, done),
    )
    // Esc returns to the menu without saving; a save is final and closes the command.
    if (result === undefined) continue
    settings[key] = applyListEdits(settings[key], result)

    if (result.added.length > 0) {
      ctx.ui.notify(`[LOCKDOWN] Added ${result.added.map((entry) => `"${entry}"`).join(', ')} to ${key}.`, 'info')
    }
    if (result.removed.length > 0) {
      ctx.ui.notify(`[LOCKDOWN] Removed ${result.removed.map((entry) => `"${entry}"`).join(', ')} from ${key}.`, 'info')
    }
    return
  }
}

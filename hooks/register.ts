import type { Register } from 'claude-code'

// Runs a watcher command for the life of the session. A watcher blocks until something happens, prints what
// happened and exits. The loop restarts it and opens a turn only when it printed something, so the model never
// spends a turn waiting on the watcher or starting it again.

// A run shorter than this is followed by BACKOFF_MS, so a command that fails or returns at once cannot spin.
const QUICK_RUN_MS = 30_000
const RESTART_MS = 2_000
const BACKOFF_MS = 60_000
// The same report within this window opens no second turn.
const REPEAT_WINDOW_MS = 15 * 60 * 1000

export function ignorePattern(source: string): RegExp | undefined {
  if (source.trim() === '') return undefined
  try {
    return new RegExp(source)
  } catch {
    return undefined
  }
}

export function eventText(out: string, ignore: RegExp | undefined, lines: number): string | undefined {
  const text = out.trim()
  if (text === '' || ignore?.test(text)) return undefined
  return text.split('\n').slice(-lines).join('\n')
}

export function nextDelayMs(ranMs: number): number {
  return ranMs < QUICK_RUN_MS ? BACKOFF_MS : RESTART_MS
}

export function lastLine(text: string): string {
  return text.trim().split('\n').pop()?.trim().slice(0, 120) ?? ''
}

export const register: Register = (on, options) => {
  const command = String(options.command ?? '').trim()
  const ignore = ignorePattern(String(options.ignore ?? ''))
  const lines = Math.max(1, Math.floor(Number(options.lines)) || 20)

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    if (command === '') {
      $.ui.status('no watcher command set; set one in /config')
      return started
    }

    const seen = new Map<string, number>()
    const iterate = (): void => {
      void (async () => {
        const begun = await $.clock.now()
        let out = ''
        let err = ''
        try {
          for await (const piece of $.process.spawn({ argv: ['sh', '-c', command] })) {
            if (piece.stream === 'stdout') out += piece.text
            else err += piece.text
          }
        } catch (error) {
          err = String(error)
        }
        const now = await $.clock.now()
        const ranMs = now - begun

        const text = eventText(out, ignore, lines)
        if (text !== undefined) {
          const key = text.slice(0, 200)
          if ((seen.get(key) ?? 0) < now - REPEAT_WINDOW_MS) {
            seen.set(key, now)
            void $.prompt.submit({
              text: `[watcher-loop] ${text}\n(watcher-loop has already restarted the watcher; there is no need to start it again.)`,
            })
          }
        }

        // A quick run that printed nothing but errors is a broken command: say so instead of failing silently.
        if (text === undefined && ranMs < QUICK_RUN_MS && err.trim() !== '') $.ui.status(lastLine(err))
        else $.ui.status(undefined)

        $.clock.after(nextDelayMs(ranMs), iterate)
      })()
    }
    iterate()
    return started
  })
}

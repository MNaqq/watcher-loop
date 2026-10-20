import { describe, expect, test } from 'claude-code/testing'
import { eventText, ignorePattern, lastLine, nextDelayMs } from './register'

describe('watcher output', () => {
  test('a report opens a turn with its last lines', async () => {
    expect(eventText('build failed: 3 tests\n', undefined, 20)).toBe('build failed: 3 tests')
    expect(eventText('a\nb\nc\nd', undefined, 2)).toBe('c\nd')
  })
  test('empty output opens nothing', async () => {
    expect(eventText('', undefined, 20)).toBeUndefined()
    expect(eventText(' \n\n ', undefined, 20)).toBeUndefined()
  })
  test('output matching the ignore pattern opens nothing', async () => {
    const ignore = ignorePattern('TIMEOUT|ALREADY RUNNING')
    expect(eventText('WATCH TIMEOUT after 90 min', ignore, 20)).toBeUndefined()
    expect(eventText('WATCHER ALREADY RUNNING', ignore, 20)).toBeUndefined()
    expect(eventText('deploy finished', ignore, 20)).toBe('deploy finished')
  })
  test('a blank or broken ignore pattern ignores nothing', async () => {
    expect(ignorePattern('')).toBeUndefined()
    expect(ignorePattern('(unclosed')).toBeUndefined()
  })
})

describe('restart timing', () => {
  test('a quick run waits a minute, a long one restarts at once', async () => {
    expect(nextDelayMs(500)).toBe(60_000)
    expect(nextDelayMs(29_999)).toBe(60_000)
    expect(nextDelayMs(30_000)).toBe(2_000)
    expect(nextDelayMs(90 * 60 * 1000)).toBe(2_000)
  })
  test('an error shows its last line', async () => {
    expect(lastLine('sh: 1: ./watch.sh: not found\n')).toBe('sh: 1: ./watch.sh: not found')
    expect(lastLine('warning\nfatal: no such file\n')).toBe('fatal: no such file')
  })
})

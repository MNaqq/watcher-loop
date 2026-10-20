# watcher-loop

**Let Claude Code wait for things without spending a single token.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

watcher-loop is a Claude Code mod. It runs your watcher command in the background for the whole session and wakes Claude up only when something actually happens.

## The problem

"Tell me when CI finishes." "Watch the deploy." "Keep an eye on the other agents." Claude has two bad ways to wait:

- **Poll.** Check every few minutes, spending a turn and tokens each time, mostly to learn that nothing happened.
- **Block.** Sit in a long `sleep` inside a turn, tying up the session until it times out.

And when a background watcher finally fires, Claude spends another turn starting it again.

## The fix

watcher-loop runs the watcher outside the model:

```
session starts
  └─> run your command ──(prints nothing)──────────> run it again
             │
             └─(prints something)──> Claude gets a turn ──> run it again
```

While nothing happens, the model does nothing and costs nothing. When your watcher prints something, Claude gets a new turn with that output, as if you had typed it, and the watcher is already running again.

It was built for a Claude Code session that directs dozens of background agents and only needs to wake up when one of them reports in. It works just as well for one CI run.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install watcher-loop --marketplace MNaqq/watcher-loop
```

Answer `y` to add the marketplace, press Enter to pick a scope, then set the **Watcher command** on the setup screen.

From a shell:

```
claude plugin install watcher-loop --marketplace MNaqq/watcher-loop
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `MNaqq/watcher-loop`, then **Add plugin**.

## Settings

| Setting | What it does | Default |
| --- | --- | --- |
| `command` | The watcher. Runs with `sh -c` in the session's working directory. Required. | none |
| `ignore` | A regular expression. Output that matches opens no turn, for example `TIMEOUT\|ALREADY RUNNING`. | empty |
| `lines` | How many of the last output lines Claude receives. | `20` |

Each setting is also a row in `/config`, and changing one there restarts the mod with the new value.

## Writing a watcher

The whole contract:

1. Block until something happens.
2. Print what happened. That text becomes Claude's prompt.
3. Exit.

Print nothing if you give up waiting (a timeout), and the loop quietly starts you again. Report each event once: move the file, advance a marker, so the next run waits for the next event instead of repeating the last one.

### Hand Claude tasks by dropping files in a folder

```sh
while :; do f=$(ls ~/inbox/*.md 2>/dev/null | head -1); [ -n "$f" ] && { cat "$f"; mv "$f" ~/inbox/done/; exit; }; sleep 5; done
```

### Wake up when another agent writes a report

```sh
m=~/.cache/reports-mark; [ -f "$m" ] || touch "$m"
while :; do
  touch "$m.next"
  new=$(find ~/agents -name '*-REPORT.md' -newer "$m")
  [ -n "$new" ] && { mv "$m.next" "$m"; for f in $new; do echo "$f: $(head -1 "$f")"; done; exit; }
  sleep 10
done
```

### Hear about every finished CI run

```sh
seen=~/.cache/ci-seen; touch "$seen"
while :; do
  gh run list --limit 5 --json databaseId,status,conclusion,displayTitle \
    -q '.[] | select(.status=="completed") | "\(.databaseId) \(.conclusion) \(.displayTitle)"' |
  while read -r id rest; do
    grep -qx "$id" "$seen" || { echo "$id" >> "$seen"; echo "CI run $id: $rest"; }
  done | grep . && exit
  sleep 30
done
```

Save a longer watcher as a script and set `command` to something like `sh ~/bin/wait-for-ci.sh`.

## How it behaves

- It starts with the session and stops with it; the watcher process ends when the session does.
- A run that lasted 30 seconds or more is restarted after 2 seconds. A shorter run waits 60 seconds first, so a broken command can't spin.
- The same output within 15 minutes opens only one turn.
- If a quick run prints only errors, the status line shows the last error line.
- Claude sees `[watcher-loop] <your output>`, plus a note that the watcher is already running again, so it doesn't try to restart it.

## Requirements

A Claude Code version that runs mods (plugins with a hooks module). Tested on 2.1.304, on Linux. The watcher runs with `sh`, so on Windows use WSL.

## License

[MIT](LICENSE)

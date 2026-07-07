# pi-context-viewer

Pi extension that captures the exact payload sent to the LLM on each provider request, so you can see what the model actually sees — system prompt, full message history, tool results — not the pi-managed view of it.

## Install

```bash
pi install git:github.com/ricp/pi-context-viewer@v0.1.0
```

## Commands

- `/context` or `/context count` — buffer stats (turns, provider hits, size)
- `/context latest` — dump the most recent payload
- `/context <n>` — dump the nth-most-recent (1-based)
- `/context breakdown` — per-message size table for the latest payload (find the bloat)
- `/context clear` — wipe the buffer

If `$PAGER` is set (`less`, `bat`, …), output is piped to it. Otherwise the payload is dumped to a notify, truncated past 4KB.

The in-memory ring buffer holds the last 50 payloads. `/reload` resets state.

## Example output

### `/context count`

```
turns: 7 · provider hits: 12 · buffered: 12/50 · total: 12
```

### `/context breakdown`

```
#0 user       24 chars [text 24ch]
#1 assistant  187 chars [text+toolUse]
#2 toolResult 48211 chars [text 48211ch]
#3 user       31 chars [text 31ch]
#4 assistant  203 chars [text 32ch+toolUse]
#5 toolResult 8942 chars [text 8942ch]
#6 user       22 chars [text 22ch]
--- system (system): 9417 chars
=== total: 67037 chars (7 messages + system)
```

In one glance: `#2` is a 48 KB tool result (the model asked `cat` on a big file) and `#5` is another 8.9 KB. The system prompt is 9.4 KB. Those three are 98% of the bill.

### `/context latest` (with `$PAGER=less`)

```
{
  "model": "claude-sonnet-4",
  "system": [
    { "type": "text", "text": "You are Pi, an AI coding assistant..." }
  ],
  "messages": [
    { "role": "user", "content": [{ "type": "text", "text": "..." }] },
    { "role": "assistant", "content": [...] },
    ...
  ],
  "tools": [...],
  "temperature": 1
}
```

## License

MIT

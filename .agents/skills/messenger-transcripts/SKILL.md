---
name: messenger-transcripts
description: Messenger bot transcripts with tool calls, read from production. Use when investigating a customer Messenger conversation, a wrong or missing bot reply, a failed or retried turn, a handoff, or an admin Telegram bot run.
---

# Messenger transcripts

Each conversation is one Durable Object in `apps/messenger`. Its transcript holds everything the bot stored: raw inbound events, full model messages with tool calls and results, saved turn outcomes, every send, payments, cart, checkout and meta. Transcripts contain real customer text, so dumps live in `EVAL_DIR` (`~/dev/scratchpad/vit-store/messenger-eval/`) and stay out of every repo.

## Steps

1. **Token.** `ADMIN_TOKEN` sits in `<main checkout>/.env.prod`. From a worktree, point `--env-file` at the main checkout's file.
2. **Pull.** For a whole day or more, run from `apps/messenger`:

   ```bash
   bun --env-file=<main checkout>/.env.prod scripts/eval/pull-transcripts.ts [--since 2026-10-16] [--telegram <chatId>]
   ```

   `--since` defaults to yesterday 00:00 Ulaanbaatar. Output is one file per thread in `<EVAL_DIR>/transcripts/<date>/`, named after the thread id with `:` turned into `_`. For a single thread, curl it:

   ```bash
   ADMIN_TOKEN=$(rg -N '^ADMIN_TOKEN=' <main checkout>/.env.prod | cut -d= -f2-)
   curl -s -H "authorization: Bearer $ADMIN_TOKEN" \
     "https://messenger.amerikvitamin.mn/admin/conversations/$(printf %s "$THREAD" | jq -sRr @uri)/transcript"
   ```

   Thread ids look like `zernio:<accountId>:<conversationId>`. List recent ones with `GET /admin/conversations?since=<epoch ms>`. Admin bot chats use `GET /admin/telegram/<chatId>/transcript`, and the admin chat ids are the comma-separated `TELEGRAM_ADMIN_CHAT_ID` in `.env.prod`, one `--telegram` flag each.
3. **Read.** Done when every turn you were asked about is traced from its inbox row through its messages to its sends, with the failing step named.

## Reading a transcript

`turn_id` is the join key across the whole transcript:

- `inbox` rows: one per customer event, with `status` (`pending`, `processing`, `applied`, `done`, `failed`), `attempts` and the `turn_id` that answered it. `payload` is the parsed Zernio event. Button taps carry `metadata.postbackPayload` or `quickReplyPayload` and run as code paths without a model turn.
- `messages`: AI SDK messages grouped by `turn_id`. Assistant content holds `tool-call` parts (`toolName`, `input`), `tool` messages hold `tool-result` parts (`output`). A superseded turn keeps only its user message.
- `turns`: the validated outcome saved before sending (`reply`, `handoff`, `superseded`). A replayed turn resends this instead of rerunning the model.
- `outbox`: sent parts keyed `<turnId>:<part>` (`text`, `cards`, `handoff`, ...). Payment and tap sends use the event id or `pay_<paymentNumber>` as the prefix.
- `meta`: `paused_until` means a handoff paused the bot, `ad_id` the ad that started the chat.

An inbox row with a `turn_id` but no `messages` for that turn is a turn that threw. Its error is in the worker logs.

Tool calls of one thread, in order:

```bash
nu -c 'open <file> | get messages | where ($it.content.content | describe) =~ "^(list|table)" | each {|m| $m.content.content | each {|p| $p | insert turn $m.turn_id } } | flatten | where type in [tool-call tool-result] | select turn type toolName input? output?'
```

## Logs

Workers Logs, shipped to Axiom, carry one JSON line per event, all with `thread` or `conversation` plus `turn_id` or `key` for joining back to the transcript:

- `event: "turn"`: one per customer model turn, with `outcome`, `attempt`, `reply_text`, `tool_calls`, tokens and `step_ms`. `outcome: "error"` lines carry `turn_ids`, `event_ids` and `error`.
- `event: "send"`: every outbound Zernio send with its outbox `key`.
- `event: "admin_turn"`: one per admin bot run, `outcome: "error"` on failure.

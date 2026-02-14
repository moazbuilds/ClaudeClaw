---
description: View or modify heartbeat settings
---

View or modify the heartbeat daemon settings. Use `$ARGUMENTS` to determine the action.

Parse `$ARGUMENTS` to identify what the user wants. If no arguments are given, show the current config.

## Sub-commands

### `show` (default when no arguments)

1. Read `.claude/claudeclaw/settings.json`.
2. Display all settings clearly:

   **Heartbeat**
   - Enabled: yes/no
   - Interval: Xm
   - Prompt: (show full prompt or "not set")

   **Telegram**
   - Token: (first 5 chars + "..." or "not configured")
   - Allowed users: (list IDs or "none")

3. Also list any cron jobs from `.claude/claudeclaw/jobs/` with their name and schedule.
4. Remind the user that changes are hot-reloaded every 30s — no daemon restart needed.

### `heartbeat on` / `heartbeat off` / `heartbeat enable` / `heartbeat disable`

Toggle the heartbeat on or off.

1. Read `.claude/claudeclaw/settings.json`.
2. Set `heartbeat.enabled` to `true` or `false` based on the command.
3. Write the updated settings back.
4. Confirm the change.

### `heartbeat interval <minutes>` / `interval <minutes>`

Change the heartbeat interval.

1. Parse the number of minutes from `$ARGUMENTS`. If not provided or invalid, use **AskUserQuestion**: "How often should the heartbeat run?" (header: "Interval", options: "5 minutes", "15 minutes (Recommended)", "30 minutes", "60 minutes")
2. Read `.claude/claudeclaw/settings.json`.
3. Set `heartbeat.interval` to the new value.
4. Write the updated settings back.
5. Confirm the change. The daemon will pick up the new interval within 30 seconds.

### `heartbeat prompt` / `prompt`

Change the heartbeat prompt.

1. Read `.claude/claudeclaw/settings.json` and show the current prompt.
2. Use **AskUserQuestion**: "What prompt should the heartbeat run?" (header: "Prompt", options: suggest 2-3 prompts relevant to the project, plus the current prompt if set as an option)
3. Set `heartbeat.prompt` to the new value.
4. Write the updated settings back.
5. Confirm the change.

### `telegram token <token>` / `telegram token`

Set or update the Telegram bot token.

1. If token is in `$ARGUMENTS`, use it directly.
2. Otherwise, use **AskUserQuestion**: "What is your Telegram bot token from @BotFather?" (header: "Token", options: let user type via Other)
3. Read `.claude/claudeclaw/settings.json`.
4. Set `telegram.token` to the new value.
5. Write and confirm.

### `telegram users <id1,id2,...>` / `telegram users`

Set the allowed Telegram user IDs.

1. If IDs are in `$ARGUMENTS`, parse them as comma-separated numbers.
2. Otherwise, use **AskUserQuestion**: "What Telegram user IDs should be allowed? (comma-separated)" (header: "User IDs", options: let user type via Other)
3. Read `.claude/claudeclaw/settings.json`.
4. Set `telegram.allowedUserIds` to the array of numbers.
5. Write and confirm.

### `telegram off` / `telegram disable`

Disable Telegram integration.

1. Read `.claude/claudeclaw/settings.json`.
2. Set `telegram.token` to `""` and `telegram.allowedUserIds` to `[]`.
3. Write and confirm.

### `reset`

Reset all settings to defaults.

1. Use **AskUserQuestion**: "Reset all settings to defaults? This will disable heartbeat and clear Telegram config." (header: "Confirm", options: "Yes, reset everything", "No, keep current settings")
2. If confirmed, write the default settings:
   ```json
   {
     "heartbeat": {
       "enabled": false,
       "interval": 15,
       "prompt": ""
     },
     "telegram": {
       "token": "",
       "allowedUserIds": []
     }
   }
   ```
3. Confirm the reset. Note: this does not delete cron jobs — use `/heartbeat:jobs delete` for that.

---

## Reference: Settings File

Location: `.claude/claudeclaw/settings.json`

```json
{
  "heartbeat": {
    "enabled": true,
    "interval": 15,
    "prompt": "Check git status and summarize recent changes."
  },
  "telegram": {
    "token": "123456:ABC-DEF...",
    "allowedUserIds": [123456789]
  }
}
```

| Key                        | Type       | Description                                    |
|----------------------------|------------|------------------------------------------------|
| `heartbeat.enabled`        | boolean    | Whether the recurring heartbeat runs           |
| `heartbeat.interval`       | number     | Minutes between heartbeat executions           |
| `heartbeat.prompt`         | string     | Prompt sent to Claude on each heartbeat        |
| `heartbeat.timezone`       | string     | IANA timezone for quiet hours (e.g. `America/New_York`) |
| `heartbeat.excludeWindows` | object[]   | Quiet windows where heartbeat is skipped       |
| `telegram.token`           | string     | Bot token from @BotFather                      |
| `telegram.allowedUserIds`  | number[]   | Telegram user IDs allowed to interact          |

The daemon hot-reloads this file every 30 seconds. No restart needed after changes.

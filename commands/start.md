---
description: Start the heartbeat daemon
---

Start the heartbeat daemon for this project. Follow these steps exactly:

1. **Check if already running**: Read `.claude/heartbeat/daemon.pid`. If it exists, check if the process is alive with `kill -0 <pid>`. If alive, tell the user the daemon is already running and exit.

2. **Ensure Bun is installed**: Run `which bun`. If it's not found:
   - Tell the user Bun is required and will be auto-installed.
   - Run:
     ```bash
     curl -fsSL https://bun.sh/install | bash
     ```
   - Then source the shell profile to make `bun` available in the current session:
     ```bash
     source ~/.bashrc 2>/dev/null || source ~/.zshrc 2>/dev/null || true
     ```
   - Verify `bun` is now available with `which bun`. If still not found, tell the user installation failed and to install manually from https://bun.sh, then exit.
   - Tell the user Bun was auto-installed successfully.

3. **Initialize config if needed**: If `.claude/heartbeat/` doesn't exist:
   - Create `.claude/heartbeat/`, `.claude/heartbeat/jobs/`, `.claude/heartbeat/logs/`
   - Write `.claude/heartbeat/settings.json`:
     ```json
     {
       "heartbeat": {
         "enabled": true,
         "interval": 15,
         "prompt": "Check system health and report any issues."
       },
       "telegram": {
         "token": "",
         "allowedUserIds": [],
         "projectPath": ""
       }
     }
     ```
   - Write `.claude/heartbeat/jobs/example.md`:
     ```
     ---
     schedule: "0 9 * * *"
     ---
     Review yesterday's git commits and summarize.
     ```

4. **Launch daemon**: Run this command to start the daemon in the background:
   ```bash
   nohup bun run ${CLAUDE_PLUGIN_ROOT}/src/index.ts > .claude/heartbeat/logs/daemon.log 2>&1 &
   ```

5. **Report**: Print the ASCII art below then show the PID and status info.

IMPORTANT: The 🦞 emoji takes 2 character widths in monospace. You MUST copy the exact spacing below character-for-character. Do NOT add or remove any spaces. Output it inside a markdown code block:

```
      🦞  ▐▛███▜▌  🦞
         ▝▜█████▛▘
           ▘▘ ▝▝

   HELLO, I AM YOUR CLAUDECLAW!
```

Then tell the user the daemon is running and show the PID. Mention they can use `/heartbeat:status` to check on it and `/heartbeat:stop` to stop it.

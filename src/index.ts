import { readdir, writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { run } from "./runner";
import { writeState, type StateData } from "./statusline";

const CLAUDE_DIR = join(process.cwd(), ".claude");
const HEARTBEAT_DIR = join(CLAUDE_DIR, "heartbeat");
const STATUSLINE_FILE = join(CLAUDE_DIR, "statusline.cjs");
const CLAUDE_SETTINGS_FILE = join(CLAUDE_DIR, "settings.json");
const JOBS_DIR = join(HEARTBEAT_DIR, "jobs");
const PID_FILE = join(HEARTBEAT_DIR, "daemon.pid");

// --- Inline cron matcher ---

function matchCronField(field: string, value: number): boolean {
  for (const part of field.split(",")) {
    // Handle step values: */5 or 1-10/2
    const [range, stepStr] = part.split("/");
    const step = stepStr ? parseInt(stepStr) : 1;

    if (range === "*") {
      if (value % step === 0) return true;
      continue;
    }

    // Handle ranges: 1-5
    if (range.includes("-")) {
      const [lo, hi] = range.split("-").map(Number);
      if (value >= lo && value <= hi && (value - lo) % step === 0) return true;
      continue;
    }

    // Single value
    if (parseInt(range) === value) return true;
  }
  return false;
}

function cronMatches(expr: string, date: Date): boolean {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = expr.trim().split(/\s+/);
  const d = {
    minute: date.getMinutes(),
    hour: date.getHours(),
    dayOfMonth: date.getDate(),
    month: date.getMonth() + 1,
    dayOfWeek: date.getDay(), // 0 = Sunday
  };

  return (
    matchCronField(minute, d.minute) &&
    matchCronField(hour, d.hour) &&
    matchCronField(dayOfMonth, d.dayOfMonth) &&
    matchCronField(month, d.month) &&
    matchCronField(dayOfWeek, d.dayOfWeek)
  );
}

// --- Next run finder ---

function nextCronMatch(expr: string, after: Date): Date {
  const d = new Date(after);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1); // start from next minute
  // Scan up to 48 hours ahead
  for (let i = 0; i < 2880; i++) {
    if (cronMatches(expr, d)) return d;
    d.setMinutes(d.getMinutes() + 1);
  }
  return d;
}

// --- Job loader ---

interface Job {
  name: string;
  schedule: string;
  prompt: string;
}

function parseJobFile(name: string, content: string): Job | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) {
    console.error(`Invalid job file format: ${name}`);
    return null;
  }

  const frontmatter = match[1];
  const prompt = match[2].trim();

  const scheduleLine = frontmatter
    .split("\n")
    .find((l) => l.startsWith("schedule:"));
  if (!scheduleLine) {
    console.error(`No schedule found in job: ${name}`);
    return null;
  }

  const schedule = scheduleLine
    .replace("schedule:", "")
    .trim()
    .replace(/^["']|["']$/g, "");

  return { name, schedule, prompt };
}

async function loadJobs(): Promise<Job[]> {
  const jobs: Job[] = [];
  let files: string[];
  try {
    files = await readdir(JOBS_DIR);
  } catch {
    return jobs;
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const content = await Bun.file(join(JOBS_DIR, file)).text();
    const job = parseJobFile(file.replace(/\.md$/, ""), content);
    if (job) jobs.push(job);
  }
  return jobs;
}

// --- PID file management ---

async function writePidFile() {
  await writeFile(PID_FILE, String(process.pid) + "\n");
}

async function cleanupPidFile() {
  try {
    await unlink(PID_FILE);
  } catch {
    // already gone
  }
}

// --- Statusline setup/teardown ---

const STATUSLINE_SCRIPT = `#!/usr/bin/env node
const { readFileSync } = require("fs");
const { join } = require("path");

const STATE_FILE = join(__dirname, "heartbeat", "state.json");

function formatCountdown(ms) {
  if (ms <= 0) return "now!";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return h + "h " + m + "m";
  if (m > 0) return m + "m";
  return "<1m";
}

try {
  const state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  const now = Date.now();
  const parts = [];

  if (state.heartbeat) {
    parts.push("\\x1b[31m\\u2665\\x1b[0m " + formatCountdown(state.heartbeat.nextAt - now));
  }

  for (const job of state.jobs || []) {
    parts.push(job.name + " " + formatCountdown(job.nextAt - now));
  }

  process.stdout.write(parts.join(" \\x1b[2m|\\x1b[0m "));
} catch {
  process.stdout.write("\\x1b[31m\\u2665\\x1b[0m waiting...");
}
`;

async function setupStatusline() {
  await mkdir(CLAUDE_DIR, { recursive: true });
  await writeFile(STATUSLINE_FILE, STATUSLINE_SCRIPT);

  // Read existing settings, merge in statusLine config
  let settings: Record<string, unknown> = {};
  try {
    settings = await Bun.file(CLAUDE_SETTINGS_FILE).json();
  } catch {
    // file doesn't exist or isn't valid JSON
  }
  settings.statusLine = {
    type: "command",
    command: "node .claude/statusline.cjs",
  };
  await writeFile(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
}

async function teardownStatusline() {
  // Remove statusLine from settings
  try {
    const settings = await Bun.file(CLAUDE_SETTINGS_FILE).json();
    delete settings.statusLine;
    await writeFile(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
  } catch {
    // file doesn't exist, nothing to clean up
  }

  // Remove the statusline script
  try {
    await unlink(STATUSLINE_FILE);
  } catch {
    // already gone
  }
}

// --- Stop command ---

async function stopDaemon() {
  let pid: string;
  try {
    pid = (await Bun.file(PID_FILE).text()).trim();
  } catch {
    console.log("No daemon is running (PID file not found).");
    process.exit(0);
  }

  try {
    process.kill(Number(pid), "SIGTERM");
    console.log(`Stopped daemon (PID ${pid}).`);
  } catch {
    console.log(`Daemon process ${pid} already dead.`);
  }

  await cleanupPidFile();
  await teardownStatusline();

  // Clean up state file
  try {
    await unlink(join(HEARTBEAT_DIR, "state.json"));
  } catch {
    // already gone
  }

  process.exit(0);
}

// --- Main ---

interface Settings {
  heartbeat: {
    enabled: boolean;
    interval: number;
    prompt: string;
  };
}

async function main() {
  const settingsFile = Bun.file(join(HEARTBEAT_DIR, "settings.json"));
  const settings: Settings = await settingsFile.json();
  const jobs = await loadJobs();

  // Set up statusline
  await setupStatusline();

  // Write PID file
  await writePidFile();

  // Clean up on exit
  async function shutdown() {
    await teardownStatusline();
    await cleanupPidFile();
    process.exit(0);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log("Claude Heartbeat daemon started");
  console.log(`  PID: ${process.pid}`);
  console.log(`  Heartbeat: ${settings.heartbeat.enabled ? `every ${settings.heartbeat.interval}m` : "disabled"}`);
  console.log(`  Jobs loaded: ${jobs.length}`);
  jobs.forEach((j) => console.log(`    - ${j.name} [${j.schedule}]`));

  // Heartbeat loop
  let nextHeartbeatAt = 0;
  if (settings.heartbeat.enabled) {
    const ms = settings.heartbeat.interval * 60_000;
    run("heartbeat", settings.heartbeat.prompt);
    nextHeartbeatAt = Date.now() + ms;
    setInterval(() => {
      run("heartbeat", settings.heartbeat.prompt);
      nextHeartbeatAt = Date.now() + ms;
    }, ms);
  }

  // Compute and write state for the statusline
  function updateState() {
    const now = new Date();
    const state: StateData = {
      heartbeat: settings.heartbeat.enabled
        ? { nextAt: nextHeartbeatAt }
        : undefined,
      jobs: jobs.map((job) => ({
        name: job.name,
        nextAt: nextCronMatch(job.schedule, now).getTime(),
      })),
    };
    writeState(state);
  }

  updateState();

  // Cron jobs — check every 60 seconds, then update state
  setInterval(() => {
    const now = new Date();
    for (const job of jobs) {
      if (cronMatches(job.schedule, now)) {
        run(job.name, job.prompt);
      }
    }
    updateState();
  }, 60_000);
}

if (process.argv.includes("--stop")) {
  stopDaemon();
} else {
  main();
}

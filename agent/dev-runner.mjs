// Starts the Next dev server AND the local browser agent from one command.
//
// Written by hand rather than pulling in `concurrently`: this is the only place
// in the repo that needs it, and a dependency-free child_process runner is
// fewer moving parts than a new devDependency (see CLAUDE.md rule 4).
//
// The agent is best-effort on purpose. If it fails to start — most often
// because `agent/node_modules` is missing — `pnpm dev` must still bring up the
// Monitor. A dead agent only disables the "Open account" button; it is not a
// reason to block front-end work.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const agentDir = dirname(fileURLToPath(import.meta.url))
const rootDir = join(agentDir, '..')

// Next loads .env itself, but not until after it has already decided which
// port to bind — so the port has to be read here and passed as `-p`. Parsed by
// hand for the same reason the runner exists at all: two keys are not worth a
// dependency, and dotenv-cli would inject the whole file pre-expanded, which
// would shadow Next's own .env handling.
const readEnvFile = () => {
  const file = join(rootDir, '.env')

  if (!existsSync(file)) return {}

  const vars = {}

  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)

    if (!match) continue

    // Strip surrounding quotes and any trailing `# comment`.
    let value = match[2].trim()

    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    else value = value.replace(/\s+#.*$/, '').trim()

    vars[match[1]] = value
  }

  return vars
}

const fileEnv = readEnvFile()

// A real shell variable wins over the file, so `PORT=4005 pnpm dev` still works.
const readPort = (key, fallback) => {
  const value = Number(process.env[key] ?? fileEnv[key])

  return Number.isInteger(value) && value > 0 ? value : fallback
}

const port = readPort('PORT', 4001)
const agentPort = readPort('AGENT_PORT', 7788)

// The agent's CORS allowlist has to track the Monitor's port, and the agent
// runs with cwd=agent/ so it never sees the root .env on its own.
const childEnv = {
  ...process.env,
  PORT: String(port),
  AGENT_PORT: String(agentPort),
  AGENT_ALLOWED_ORIGINS:
    process.env.AGENT_ALLOWED_ORIGINS ??
    fileEnv.AGENT_ALLOWED_ORIGINS ??
    `http://localhost:${port},http://127.0.0.1:${port}`
}

const children = []

const run = (label, command, args, options) => {
  const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options })

  child.on('error', err => console.error(`[${label}] failed to start: ${err.message}`))
  children.push({ label, child })

  return child
}

// ── Local browser agent ────────────────────────────────────────────────────
if (!existsSync(join(agentDir, 'node_modules'))) {
  console.warn(
    '\n⚠️  agent/node_modules is missing — starting the Monitor without the browser agent.' +
      '\n   "Open account" stays disabled until you run:  cd agent && npm install\n'
  )
} else {
  run('agent', process.execPath, [join(agentDir, 'server.js')], { cwd: agentDir, env: childEnv })
}

// ── Next dev server ────────────────────────────────────────────────────────
const next = run('next', 'npx', ['next', 'dev', '--turbopack', '-p', String(port)], {
  cwd: rootDir,
  env: childEnv
})

// Next owns the lifetime: when it exits, so does everything else. Chrome
// windows the agent opened are unaffected — the agent detaches them at launch.
const shutdown = signal => {
  for (const { child } of children) {
    if (!child.killed) child.kill(signal)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

next.on('exit', code => {
  shutdown('SIGTERM')
  process.exit(code ?? 0)
})

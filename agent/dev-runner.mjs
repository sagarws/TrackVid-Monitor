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
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const agentDir = dirname(fileURLToPath(import.meta.url))
const rootDir = join(agentDir, '..')

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
  run('agent', process.execPath, [join(agentDir, 'server.js')], { cwd: agentDir })
}

// ── Next dev server ────────────────────────────────────────────────────────
const next = run('next', 'npx', ['next', 'dev', '--turbopack', '-p', '4001'], { cwd: rootDir })

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

#!/usr/bin/env node
/**
 * capacity-probe.mjs — soft capacity / OOM guardrail probe for dsh-full.
 * Run inside the container or locally to verify cgroup + inflight limits.
 */
import { cpus, freemem, totalmem } from 'os'
import { readFileSync, existsSync } from 'fs'

const MAX_INFLIGHT = Number(process.env.CAPACITY_MAX_INFLIGHT || 2)
const SOFT_MEM_PCT = Number(process.env.CAPACITY_SOFT_MEM_PCT || 85)

function cgroupMem() {
  try {
    if (existsSync('/sys/fs/cgroup/memory.current')) {
      const current = Number(readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim())
      const max = Number(readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim()) || totalmem()
      return { current, max, pct: (current / max) * 100 }
    }
  } catch {}
  return { current: totalmem() - freemem(), max: totalmem(), pct: ((totalmem() - freemem()) / totalmem()) * 100 }
}

const mem = cgroupMem()
const report = {
  ts: new Date().toISOString(),
  cpus: cpus().length,
  mem,
  softLimitPct: SOFT_MEM_PCT,
  maxInflight: MAX_INFLIGHT,
  ok: mem.pct < SOFT_MEM_PCT,
}
console.log(JSON.stringify(report, null, 2))
process.exit(report.ok ? 0 : 1)

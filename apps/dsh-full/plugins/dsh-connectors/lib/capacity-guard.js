/**
 * Lightweight runtime capacity guard for channel/agent concurrency.
 * Reads cgroup + process memory; exposes shouldAdmit() for new work.
 */
import fs from 'node:fs'
import os from 'node:os'

function cgroupMem() {
  let max = null
  let current = null
  for (const p of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try {
      const v = fs.readFileSync(p, 'utf8').trim()
      if (v && v !== 'max') {
        max = Number(v)
        break
      }
    } catch {}
  }
  for (const p of ['/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory/memory.usage_in_bytes']) {
    try {
      current = Number(fs.readFileSync(p, 'utf8').trim())
      break
    } catch {}
  }
  return { max, current }
}

export function capacitySnapshot() {
  const mem = process.memoryUsage()
  const cg = cgroupMem()
  return {
    ts: new Date().toISOString(),
    rss_mb: Math.round(mem.rss / 1024 / 1024),
    heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
    cpus: os.cpus().length,
    loadavg1: Math.round(os.loadavg()[0] * 100) / 100,
    cgroup_max_mb: cg.max != null ? Math.round(cg.max / 1024 / 1024) : null,
    cgroup_current_mb: cg.current != null ? Math.round(cg.current / 1024 / 1024) : null,
  }
}

/**
 * @param {{ inflight?: number, softMemRatio?: number }} opts
 */
export function shouldAdmit(opts = {}) {
  const soft = opts.softMemRatio ?? Number(process.env.CAPACITY_SOFT_MEM_RATIO || 0.85)
  const maxInflight = Number(process.env.CAPACITY_MAX_INFLIGHT || 2)
  const inflight = opts.inflight ?? 0
  const s = capacitySnapshot()
  if (inflight >= maxInflight) {
    return { ok: false, reason: `inflight ${inflight} >= max ${maxInflight}`, snap: s }
  }
  if (s.cgroup_max_mb && s.cgroup_current_mb && s.cgroup_current_mb / s.cgroup_max_mb >= soft) {
    return {
      ok: false,
      reason: `cgroup mem ${s.cgroup_current_mb}/${s.cgroup_max_mb} MB`,
      snap: s,
    }
  }
  if (s.heap_used_mb > Number(process.env.CAPACITY_MAX_HEAP_MB || 400)) {
    return { ok: false, reason: `heap ${s.heap_used_mb} MB`, snap: s }
  }
  return { ok: true, snap: s }
}

// `stackresolve install` - one line that wires StackResolve into whatever coding agent
// is on the machine. It mints a key if you do not have one, registers the hosted MCP
// server for every agent it finds (Claude Code, Cursor, Codex, Windsurf, VS Code), writes
// the skill so the agent knows when to reach for the tools, and verifies the key against
// the live API before it reports success.
//
// No dependencies, no interactive prompts, safe to re-run. Every file it touches is
// backed up to <file>.stackresolve.bak the first time it changes it.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { RULES_SNIPPET, SKILL_MD, SKILL_NAME } from './skill.js'

export const MCP_URL = process.env.STACKRESOLVE_MCP_URL || 'https://mcp.stackresolve.dev/mcp'
const SERVER_NAME = 'stackresolve'
const KEY_ENV = 'STACKRESOLVE_API_KEY'
// Project-scope files are commonly committed, so they reference the env var instead of
// carrying the raw key. User-scope files (~/.claude.json, ~/.cursor/mcp.json) hold the
// real key, which is how every other hosted MCP server is configured.
const KEY_REF = '${' + KEY_ENV + '}'

export type TargetId = 'claude' | 'cursor' | 'codex' | 'windsurf' | 'vscode' | 'project'

export interface StepResult {
  target: string
  path: string
  status: 'installed' | 'updated' | 'unchanged' | 'skipped' | 'failed'
  detail?: string
}

export interface InstallOptions {
  apiKey: string
  /** Explicit targets. Empty = every agent detected on this machine. */
  targets?: TargetId[]
  /** Also write ./.mcp.json + ./.claude/skills for the current repo. */
  project?: boolean
  /** Append the "call StackResolve first" rule to ./CLAUDE.md and ./AGENTS.md. */
  rules?: boolean
  /** Report what would change without writing anything. */
  dryRun?: boolean
  /** Working directory for project-scope writes. */
  cwd?: string
}

const home = () => process.env.STACKRESOLVE_HOME_OVERRIDE || homedir()

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    throw new Error(`${path} is not valid JSON. Fix or move it, then run install again.`)
  }
}

// Back up once, then write. The backup is what makes an unattended install safe to run
// against a config the user spent months building.
function writeSafely(path: string, contents: string, dryRun: boolean): void {
  if (dryRun) return
  mkdirSync(dirname(path), { recursive: true })
  const backup = `${path}.stackresolve.bak`
  if (existsSync(path) && !existsSync(backup)) copyFileSync(path, backup)
  writeFileSync(path, contents)
}

/** The MCP server entry, in the shape every JSON-config agent expects. */
export function httpServerEntry(apiKey: string): Record<string, unknown> {
  return { type: 'http', url: MCP_URL, headers: { 'x-api-key': apiKey } }
}

// Merge our server into a `{ mcpServers: { ... } }` config file without disturbing the
// servers already there.
function upsertMcpJson(path: string, target: string, apiKey: string, dryRun: boolean, keyRef = false): StepResult {
  const config = readJson(path)
  const servers = (config.mcpServers && typeof config.mcpServers === 'object' ? config.mcpServers : {}) as Record<string, unknown>
  const existing = servers[SERVER_NAME]
  const entry = httpServerEntry(keyRef ? KEY_REF : apiKey)
  if (existing && JSON.stringify(existing) === JSON.stringify(entry)) return { target, path, status: 'unchanged' }
  servers[SERVER_NAME] = entry
  config.mcpServers = servers
  writeSafely(path, `${JSON.stringify(config, null, 2)}\n`, dryRun)
  return { target, path, status: existing ? 'updated' : 'installed' }
}

// Codex reads TOML. Editing TOML structurally needs a parser we do not want to depend on,
// so we append our block when it is absent and leave an existing one alone.
function upsertCodexToml(path: string, apiKey: string, dryRun: boolean): StepResult {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : ''
  if (current.includes(`[mcp_servers.${SERVER_NAME}]`)) return { target: 'Codex', path, status: 'unchanged' }
  const block = [
    '',
    '# StackResolve (added by `stackresolve install`)',
    `[mcp_servers.${SERVER_NAME}]`,
    `url = "${MCP_URL}"`,
    `http_headers = { "x-api-key" = "${apiKey}" }`,
    '',
  ].join('\n')
  writeSafely(path, current + block, dryRun)
  return { target: 'Codex', path, status: current ? 'updated' : 'installed' }
}

function writeSkill(dir: string, dryRun: boolean): StepResult {
  const path = join(dir, SKILL_NAME, 'SKILL.md')
  if (existsSync(path) && readFileSync(path, 'utf8') === SKILL_MD) return { target: 'Skill', path, status: 'unchanged' }
  const existed = existsSync(path)
  writeSafely(path, SKILL_MD, dryRun)
  return { target: 'Skill', path, status: existed ? 'updated' : 'installed' }
}

function appendRules(path: string, dryRun: boolean): StepResult {
  const current = existsSync(path) ? readFileSync(path, 'utf8') : ''
  if (current.includes('## StackResolve')) return { target: 'Rules', path, status: 'unchanged' }
  const body = current ? `${current.replace(/\s*$/, '')}\n\n${RULES_SNIPPET}` : RULES_SNIPPET
  writeSafely(path, body, dryRun)
  return { target: 'Rules', path, status: current ? 'updated' : 'installed' }
}

/** Which agents look installed on this machine. */
export function detectTargets(): TargetId[] {
  const h = home()
  const found: TargetId[] = []
  if (existsSync(join(h, '.claude')) || existsSync(join(h, '.claude.json'))) found.push('claude')
  if (existsSync(join(h, '.cursor'))) found.push('cursor')
  if (existsSync(join(h, '.codex'))) found.push('codex')
  if (existsSync(join(h, '.codeium', 'windsurf'))) found.push('windsurf')
  if (existsSync(join(h, 'Library', 'Application Support', 'Code', 'User'))) found.push('vscode')
  if (existsSync(join(h, '.config', 'Code', 'User'))) found.push('vscode')
  return found
}

export interface InstallReport {
  steps: StepResult[]
  targets: TargetId[]
  verified: boolean
  verifyDetail: string
}

export async function runInstall(opts: InstallOptions): Promise<InstallReport> {
  const { apiKey, dryRun = false } = opts
  const h = home()
  const cwd = opts.cwd || process.cwd()
  const targets = opts.targets?.length ? opts.targets : detectTargets()
  const steps: StepResult[] = []

  const step = (fn: () => StepResult): void => {
    try { steps.push(fn()) } catch (e) { steps.push({ target: 'unknown', path: '', status: 'failed', detail: (e as Error).message }) }
  }

  for (const t of targets) {
    if (t === 'claude') {
      step(() => upsertMcpJson(join(h, '.claude.json'), 'Claude Code', apiKey, dryRun))
      step(() => writeSkill(join(h, '.claude', 'skills'), dryRun))
    }
    if (t === 'cursor') step(() => upsertMcpJson(join(h, '.cursor', 'mcp.json'), 'Cursor', apiKey, dryRun))
    if (t === 'codex') step(() => upsertCodexToml(join(h, '.codex', 'config.toml'), apiKey, dryRun))
    if (t === 'windsurf') step(() => upsertMcpJson(join(h, '.codeium', 'windsurf', 'mcp_config.json'), 'Windsurf', apiKey, dryRun))
    if (t === 'vscode') {
      const vs = existsSync(join(h, 'Library', 'Application Support', 'Code', 'User'))
        ? join(h, 'Library', 'Application Support', 'Code', 'User', 'mcp.json')
        : join(h, '.config', 'Code', 'User', 'mcp.json')
      step(() => upsertMcpJson(vs, 'VS Code', apiKey, dryRun))
    }
  }

  if (opts.project || targets.includes('project')) {
    // Committed files never carry the raw key.
    step(() => upsertMcpJson(join(cwd, '.mcp.json'), 'Project (.mcp.json)', apiKey, dryRun, true))
    step(() => writeSkill(join(cwd, '.claude', 'skills'), dryRun))
  }
  if (opts.rules) {
    step(() => appendRules(join(cwd, 'CLAUDE.md'), dryRun))
    step(() => appendRules(join(cwd, 'AGENTS.md'), dryRun))
  }

  // Prove the key works before claiming the install is done.
  let verified = false
  let verifyDetail = 'skipped (dry run)'
  if (!dryRun) {
    const base = process.env.STACKRESOLVE_BASE_URL || 'https://api.stackresolve.dev'
    try {
      const res = await fetch(`${base}/v1/usage`, { headers: { 'x-api-key': apiKey } })
      if (res.ok) {
        const body = (await res.json()) as { plan?: string }
        verified = true
        verifyDetail = `key valid · ${body.plan || 'free'} plan`
      } else {
        verifyDetail = `API returned ${res.status} for this key`
      }
    } catch (e) {
      verifyDetail = `could not reach the API (${(e as Error).message})`
    }
  }

  return { steps, targets, verified, verifyDetail }
}

/** Human-readable install report for the terminal. */
export function formatReport(r: InstallReport, apiKey: string, dryRun: boolean): string {
  const lines: string[] = []
  lines.push('')
  lines.push(dryRun ? 'StackResolve install (dry run, nothing written)' : 'StackResolve installed')
  lines.push('')
  if (!r.steps.length) {
    lines.push('  No coding agent found on this machine.')
    lines.push('  Run with a target, for example: stackresolve install --claude')
    lines.push('')
    return lines.join('\n')
  }
  for (const s of r.steps) {
    const mark = s.status === 'failed' ? 'x' : s.status === 'unchanged' ? '=' : '+'
    lines.push(`  ${mark} ${s.target.padEnd(20)} ${s.path}${s.detail ? `  (${s.detail})` : ''}`)
  }
  lines.push('')
  lines.push(`  MCP server   ${MCP_URL}`)
  lines.push(`  API key      ${apiKey.slice(0, 8)}…${apiKey.slice(-4)}`)
  lines.push(`  Verified     ${r.verified ? 'yes' : 'no'} · ${r.verifyDetail}`)
  lines.push('')
  lines.push('  Restart your agent, then ask it: "resolve: scrape JavaScript sites".')
  lines.push('')
  return lines.join('\n')
}

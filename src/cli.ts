#!/usr/bin/env node
import { StackResolve, StackResolveError } from './index.js'
import { detectTargets, formatReport, httpServerEntry, MCP_URL, runInstall, type TargetId } from './install.js'

// The `stackresolve` command. A thin client over the StackResolve API: no database, no
// local state, just your API key (STACKRESOLVE_API_KEY) and HTTP. Install globally with
// `npm i -g stackresolve`, then `stackresolve keys create` to mint one.
const BIN = 'stackresolve'
const HELP = `${BIN} - discover, evaluate, and select agent-ready software.

usage: ${BIN} <command> [args] [--json]

setup
  install                 wire StackResolve into every coding agent on this machine
                          (MCP server + skill), minting a key if you have none
    --key <ar_...>        use this key instead of minting one
    --claude --cursor     limit to specific agents (also --codex --windsurf --vscode)
    --project             also write ./.mcp.json + ./.claude/skills for this repo
    --rules               append the "call StackResolve first" rule to CLAUDE.md/AGENTS.md
    --dry-run             show what would change, write nothing
    --print               print the MCP server block instead of installing

discovery & readiness
  how-to <task...>        the CURRENT, cited, tool-aware way to build it (research before building)
  resolve <task...>       best tools for a task, ranked by capability with a reason
  resolve <task...> --discover   also search the web + audit new tools when coverage is thin
  find <task...>          rank tools for a task (compact)
  search <query...>       keyword search over the registry
  audit <domain>          score a product for agent-readiness (0-100)
  compare <a> <b> [..]    structured side-by-side of products

company research (CompanyData)
  company <domain>        structured company record
  pricing <domain>        normalized pricing
  competitors <domain>    real competing companies, not listicles
  compare-companies <a> <b> [..]   structured side-by-side of companies
  research <domain> [q]   grounded, cited answer about a company

account
  keys create [label]     mint an API key + workspace (shown once, no login needed)
  usage                   your usage this billing period

flags
  --json                  print raw JSON
  -h, --help              show this help

env
  STACKRESOLVE_API_KEY    your key (get one: ${BIN} keys create)
  STACKRESOLVE_BASE_URL   override the API base (default https://api.stackresolve.dev)

examples
  npx stackresolve install
  ${BIN} keys create "my agent"
  ${BIN} resolve "log my API errors and get alerted"
  ${BIN} audit firecrawl.dev`

async function main() {
  const raw = process.argv.slice(2)
  if (raw.includes('-h') || raw.includes('--help') || !raw.length) { console.log(HELP); process.exit(raw.length ? 0 : 1) }
  const forceJson = raw.includes('--json')
  const discover = raw.includes('--discover')
  const argv = raw.filter((a) => a !== '--json' && a !== '--discover')
  const [cmd, ...args] = argv
  const sr = new StackResolve()
  const json = (o: unknown) => console.log(JSON.stringify(o, null, 2))

  switch (cmd) {
    // One line from a fresh machine to a working agent: mint a key if needed, register
    // the hosted MCP server everywhere, write the skill, verify the key.
    case 'install':
    case 'init': {
      const flag = (name: string) => raw.includes(`--${name}`)
      const value = (name: string): string | undefined => {
        const i = raw.indexOf(`--${name}`)
        if (i >= 0 && raw[i + 1] && !raw[i + 1].startsWith('--')) return raw[i + 1]
        const inline = raw.find((a) => a.startsWith(`--${name}=`))
        return inline ? inline.slice(name.length + 3) : undefined
      }
      const explicit: TargetId[] = (['claude', 'cursor', 'codex', 'windsurf', 'vscode'] as TargetId[]).filter((t) => flag(t))

      // Key precedence: --key, then the environment, then mint a fresh one. Minting needs
      // no login, so `npx stackresolve install` works on a machine that has never seen us.
      let apiKey = value('key') || process.env.STACKRESOLVE_API_KEY || ''
      let minted = false
      if (!apiKey && !flag('print')) {
        const created = await sr.createKey('install')
        apiKey = created.key
        minted = true
      }

      if (flag('print')) {
        json({ mcpServers: { stackresolve: httpServerEntry(apiKey || '${STACKRESOLVE_API_KEY}') } })
        break
      }

      const report = await runInstall({
        apiKey,
        targets: explicit,
        project: flag('project'),
        rules: flag('rules'),
        dryRun: flag('dry-run'),
      })
      if (forceJson) { json({ ...report, minted, detected: detectTargets(), mcpUrl: MCP_URL }); break }
      if (minted) console.log(`\nMinted a new API key (save it, it is shown once):\n  ${apiKey}`)
      console.log(formatReport(report, apiKey, flag('dry-run')))
      if (!report.verified && !flag('dry-run')) process.exitCode = 1
      break
    }
    case 'keys': {
      if (args[0] !== 'create') { console.log(`usage: ${BIN} keys create [label]`); break }
      const r = await sr.createKey(args.slice(1).join(' ') || undefined)
      if (forceJson) { json(r); break }
      console.log(`\nAPI key (save it now, shown once):\n  ${r.key}\n`)
      console.log(`Use it: export STACKRESOLVE_API_KEY=${r.key}\n  workspace: ${r.workspaceId}`)
      break
    }
    case 'how-to': {
      if (!args.length) throw new Error(`usage: ${BIN} how-to <task...>`)
      const r = await sr.howTo(args.join(' '))
      if (forceJson) { json(r); break }
      console.log(`\n${r.task}   (as of ${r.asOf})\n`)
      console.log(`APPROACH\n  ${r.approach}\n`)
      if (r.recommendedTools.length) {
        console.log('TOOLS')
        for (const t of r.recommendedTools) console.log(`  ${String(t.agentready ?? '-').padStart(3)}  ${t.name.padEnd(14)} ${t.why}`)
        console.log('')
      }
      if (r.steps.length) { console.log('STEPS'); r.steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`)); console.log('') }
      if (r.gotchas.length) { console.log('GOTCHAS'); r.gotchas.forEach((g) => console.log(`  ! ${g}`)); console.log('') }
      if (r.deprecated.length) { console.log('AVOID (deprecated)'); r.deprecated.forEach((d) => console.log(`  x ${d}`)); console.log('') }
      if (r.sources.length) console.log(`sources: ${r.sources.length}`)
      break
    }
    case 'resolve': {
      if (!args.length) throw new Error(`usage: ${BIN} resolve <task...> [--discover]`)
      const r = await sr.resolve(args.join(' '), { discover })
      if (forceJson) { json(r); break }
      console.log(`\nTask: ${r.task}`)
      console.log(`Needs: ${r.capabilities.join(', ') || '(no known capability matched)'}`)
      if (r.discovered) console.log(`Discovered + audited ${r.discovered} new product(s).`)
      console.log('')
      for (const x of r.results) console.log(`  ${String(x.agentready ?? '  ?').padStart(3)}  ${x.name.padEnd(16)} ${x.reason}`)
      if (r.note) console.log(`\n  ${r.note}`)
      break
    }
    case 'find':
      if (!args.length) throw new Error(`usage: ${BIN} find <task...>`)
      json(await sr.findTools(args.join(' ')))
      break
    case 'search':
      if (!args.length) throw new Error(`usage: ${BIN} search <query...>`)
      json(await sr.search(args.join(' ')))
      break
    case 'audit': {
      if (!args[0]) throw new Error(`usage: ${BIN} audit <domain>`)
      const r = await sr.audit(args[0])
      if (forceJson) { json(r); break }
      const s = r as unknown as { name?: string; domain?: string; scores?: Record<string, number> }
      console.log(`\nAgentReady: ${s.scores?.agentready}/100   ${s.name} (${s.domain})`)
      for (const k of ['discovery', 'understanding', 'adoption', 'operability']) console.log(`  ${k.padEnd(15)} ${s.scores?.[k]}`)
      break
    }
    case 'compare':
      if (args.length < 2) throw new Error(`usage: ${BIN} compare <a> <b> [..]`)
      json(await sr.compare(args))
      break
    case 'company':
      if (!args[0]) throw new Error(`usage: ${BIN} company <domain>`)
      json(await sr.getCompany(args[0]))
      break
    case 'pricing':
      if (!args[0]) throw new Error(`usage: ${BIN} pricing <domain>`)
      json(await sr.getPricing(args[0]))
      break
    case 'research':
      if (!args[0]) throw new Error(`usage: ${BIN} research <domain> [question...]`)
      json(await sr.research(args[0], args.slice(1).join(' ') || undefined))
      break
    case 'competitors':
      if (!args[0]) throw new Error(`usage: ${BIN} competitors <domain>`)
      json(await sr.getCompetitors(args[0]))
      break
    case 'compare-companies':
      if (args.length < 2) throw new Error(`usage: ${BIN} compare-companies <domain> <domain> [..]`)
      json(await sr.compareCompanies(args))
      break
    case 'usage':
      json(await sr.getUsage())
      break
    default:
      console.error(`unknown command: ${cmd}\n`)
      console.log(HELP)
      process.exitCode = 1
  }
}

main().catch((e) => {
  if (e instanceof StackResolveError) console.error(`error ${e.status}: ${e.message}`)
  else console.error(`error: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})

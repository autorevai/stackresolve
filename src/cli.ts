#!/usr/bin/env node
import { StackResolve, StackResolveError } from './index.js'

// The `stackresolve` command. A thin client over the StackResolve API: no database, no
// local state, just your API key (STACKRESOLVE_API_KEY) and HTTP. Install globally with
// `npm i -g stackresolve`, then `stackresolve keys create` to mint one.
const BIN = 'stackresolve'
const HELP = `${BIN} - discover, evaluate, and select agent-ready software.

usage: ${BIN} <command> [args] [--json]

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
  research <domain> [q]   grounded, cited answer about a company

account
  keys create [label]     mint an API key + workspace (shown once, no login needed)

flags
  --json                  print raw JSON
  -h, --help              show this help

env
  STACKRESOLVE_API_KEY    your key (get one: ${BIN} keys create)
  STACKRESOLVE_BASE_URL   override the API base (default https://api.stackresolve.dev)

examples
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

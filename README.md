# stackresolve

Official TypeScript/Node SDK for the [StackResolve](https://stackresolve.dev) API.

StackResolve is web intelligence for AI agents: find, compare, and audit software for a
task; a scored registry of agent-ready tools and MCP servers; structured company research.
Three surfaces, one API: REST, a hosted MCP server, and this CLI/SDK. Registry reads are
free and need no key.

- Site and docs: https://stackresolve.dev
- REST: https://api.stackresolve.dev (OpenAPI at /openapi.json, llms.txt at /llms.txt)
- Hosted MCP (streamable HTTP): https://mcp.stackresolve.dev/mcp
- MCP server registry for agents: https://stackresolve.dev/mcp-servers

## MCP server

The hosted server needs no install. The handshake and the registry reads (`search_tools`,
`get_profile`, `compare_products`, `list_registry`) work without a key. Metered tools
(`resolve`, `how_to`, `audit`, `research_company`, `get_company`, `get_pricing`) need a free
key from https://stackresolve.dev/developers, sent as the `x-api-key` header.

Claude Code:

```bash
claude mcp add --transport http stackresolve https://mcp.stackresolve.dev/mcp
```

Cursor (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "stackresolve": {
      "url": "https://mcp.stackresolve.dev/mcp",
      "headers": { "x-api-key": "ar_..." }
    }
  }
}
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.stackresolve]
url = "https://mcp.stackresolve.dev/mcp"

[mcp_servers.stackresolve.headers]
x-api-key = "ar_..."
```

Tools: `resolve`, `how_to`, `find_tools_for_task`, `search_tools`, `compare_products`,
`get_profile`, `list_registry`, `audit`, `generate_agent_interfaces`, `get_company`,
`get_pricing`, `research_company`, `find_competitors`, `compare_companies`, `get_usage`.

## CLI

```bash
npm i -g stackresolve
stackresolve find "scrape javascript-heavy sites from claude code"
stackresolve audit stripe.com
stackresolve company vercel.com
stackresolve --help
```

## SDK
## Install

```bash
npm install stackresolve
```

Requires Node 18+ (uses the built-in global `fetch`). No runtime dependencies.

## Quickstart

```ts
import { StackResolve } from 'stackresolve'

const sr = new StackResolve({ apiKey: process.env.STACKRESOLVE_API_KEY })

// 1. Audit a domain: AgentReady scores, facts, and issues.
const report = await sr.audit('stripe.com')
console.log(report.scores.agentready, report.issues)

// 2. Structured company data.
const company = await sr.getCompany('vercel.com')
console.log(company.name, company.description)

// 3. Task -> ranked, agent-ready tools.
const tools = await sr.findTools('send transactional email from a Node service')
console.log(tools.results)

// 4. Run an Agent Discovery check (needs an API key).
const discovery = await sr.runDiscovery('firecrawl')
console.log(discovery)
```

## Authentication

Get an API key at [stackresolve.dev](https://stackresolve.dev). Pass it to the
constructor, or set the `STACKRESOLVE_API_KEY` environment variable:

```ts
const sr = new StackResolve({ apiKey: 'ar_...' })
// or, reading STACKRESOLVE_API_KEY from the environment:
const sr2 = new StackResolve()
```

The key is sent as the `x-api-key` header on every request. Public endpoints
(audit, search, profiles, company data, ...) work without a key, subject to an
anonymous rate limit. Gated endpoints (monitors, usage, discovery runs) need one.

You can point the client at a different host with `baseUrl` or the
`STACKRESOLVE_BASE_URL` environment variable:

```ts
const sr = new StackResolve({ apiKey, baseUrl: 'https://api.stackresolve.dev' })
```

## Errors

Any non-2xx response throws a `StackResolveError` carrying the HTTP `status` and
the parsed `body`:

```ts
import { StackResolve, StackResolveError } from 'stackresolve'

try {
  await sr.getUsage()
} catch (err) {
  if (err instanceof StackResolveError) {
    console.error(err.status, err.body)
  }
}
```

## Methods

AgentReady:
`audit(domain)`, `findTools(task)`, `search(query, requirements?)`,
`compare(slugs)`, `getProfile(slug)`, `listRegistry(opts?)`, `getCategories()`,
`getCategory(slug)`, `getDiscovery(slug)`, `runDiscovery(slug)`,
`getScoreHistory(slug)`, `generate(domain, openapiUrl?)`, `deploy(domain, openapiUrl?)`.

CompanyData:
`getCompany(domain)`, `getPricing(domain)`, `getCompetitors(domain)`,
`research(domain, question?)`, `compareCompanies(domains)`.

Monitors + account (API key required):
`listMonitors()`, `addMonitor(slug, opts?)`, `runMonitorNow(slug)`,
`getUsage()`, `getMyProfile()`.

## License

MIT

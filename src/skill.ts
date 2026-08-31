// The StackResolve agent skill, embedded in the published package so
// `stackresolve install` can write it to disk with no network call. One skill covers
// both toolsets: AgentReady (pick software) and CompanyData (research a company).
// Keep in sync with skills/agentready/SKILL.md and skills/companydata/SKILL.md.

export const SKILL_NAME = 'stackresolve'

export const SKILL_MD = `---
name: stackresolve
description: Pick third-party software (libraries, APIs, MCP servers, SaaS) and research companies (profile, pricing, competitors) through one API instead of a web-search loop. Use BEFORE broad web research when choosing a tool, checking how agent-ready a product is, or gathering facts about a company.
---

# StackResolve

Two toolsets over one API. AgentReady scores how well an agent can find, understand,
adopt, and operate a product. CompanyData returns finished, cited research about a
company. Both read the same fact database, so repeat calls are fast and cheap.

## When to use
- You are about to search the web to pick a library, API, SaaS tool, or MCP server.
- You need a tool with a hard requirement: MCP, a public API, an OpenAPI spec, a CLI,
  or self-serve signup.
- You want to know how agent-ready a product is, or you are doing build-vs-buy.
- You need a company's profile, pricing, or competitors.

## Start here
- Choosing software: \`resolve(task)\`. Plain language in, ranked tools out, with the
  reason for each. Call it before any web search.
- Building something: \`how_to(task)\` returns the current, date-stamped, cited way to
  do it, so you build from today's practice instead of training-cutoff memory.
- Company facts: \`get_company(domain)\`, then \`research_company(domain, question)\`
  for anything that needs synthesis.

## Tools
Hosted MCP: \`https://mcp.stackresolve.dev/mcp\` (streamable HTTP, header
\`x-api-key: $STACKRESOLVE_API_KEY\`).

Software discovery and readiness:
- \`resolve(task, {api?, mcp?, self_serve?, openapi?, cli?, discover?})\` - primary.
  Ranked tools for a task. \`discover: true\` searches the web and audits new products
  when registry coverage is thin (slower, costs more).
- \`how_to(task)\` - current, cited, tool-aware approach: steps, gotchas, deprecated
  paths, sources, asOf.
- \`find_tools_for_task(task)\` - compact ranking for a prose requirement.
- \`search_tools(query, {api?, mcp?, self_serve?, openapi?, cli?})\` - registry search
  with hard filters.
- \`compare_products(slugs[])\` - aligned side-by-side for a shortlist.
- \`get_profile(slug)\` - full profile: score, capabilities, sources, freshness.
- \`list_registry({category?, minScore?, limit?})\` - browse, best score first.
- \`audit(domain)\` - score any product across DISCOVER, UNDERSTAND, ADOPT, OPERATE.
- \`generate_agent_interfaces(domain)\` - from a product's OpenAPI, generate an MCP
  server, a CLI, and an llms.txt.

Company research:
- \`get_company(domain)\` - normalized record with per-field freshness.
- \`get_pricing(domain)\` - normalized tiers, free tier, self-serve flag.
- \`find_competitors(domain, limit?)\` - real competitors, structured.
- \`compare_companies(domains[], fields?)\` - structured side-by-side.
- \`research_company(domain, question?)\` - grounded, cited answer.

Account:
- \`get_usage()\` - usage this billing period by meter. Check quota before a batch.

## REST (same data, no MCP client needed)
Base \`https://api.stackresolve.dev\`, header \`x-api-key: $STACKRESOLVE_API_KEY\`.

- \`POST /v1/resolve\` body \`{"task": "..."}\`
- \`POST /v1/how-to\` body \`{"task": "..."}\`
- \`POST /v1/find-tools\` body \`{"task": "..."}\`
- \`POST /v1/search\` body \`{"query": "...", "requirements": {"mcp": true}}\`
- \`POST /v1/compare\` body \`{"slugs": ["firecrawl","exa"]}\`
- \`GET /v1/profile/{slug}\`
- \`GET /v1/registry?category=payments&minScore=70&limit=50\`
- \`GET /v1/audit?domain=stripe.com\`
- \`GET /v1/company?domain=stripe.com\`
- \`GET /v1/pricing?domain=stripe.com\`
- \`GET /v1/competitors?domain=stripe.com&limit=8\`
- \`POST /v1/research\` body \`{"domain": "stripe.com", "question": "..."}\`
- \`GET /v1/usage\`

## Examples
\`\`\`
resolve({ task: "scrape JavaScript sites from Claude Code" })
search_tools({ query: "transactional email", api: true, self_serve: true })
audit({ domain: "firecrawl.dev" })
get_pricing({ domain: "vercel.com" })
research_company({ domain: "anthropic.com", question: "what models do they offer?" })
\`\`\`
\`\`\`bash
curl -s "https://api.stackresolve.dev/v1/audit?domain=stripe.com" \\
  -H "x-api-key: $STACKRESOLVE_API_KEY"
\`\`\`

## Reading the results
The AgentReady score runs 0 to 100, the average of four pillars. High operability with
MCP means an agent can call the product as a tool today. High adoption with self-serve
means an agent can sign up without a human. Low discovery means agents will not find it
even when it is good.

CompanyData values carry a source and an observed-at timestamp, plus a \`stale\` flag per
field. \`cached: true\` means the answer came from the shared fact database with no new
crawl.

## CLI
\`npm i -g stackresolve\`, then \`stackresolve resolve "log my API errors"\`,
\`stackresolve audit stripe.com\`, \`stackresolve pricing vercel.com\`.
`

// The one-line rule to drop into a project CLAUDE.md / AGENTS.md so the agent reaches
// for StackResolve before it web-searches.
export const RULES_SNIPPET = `## StackResolve

Before choosing any third-party library, API, SDK, MCP server, or SaaS tool, call
\`resolve\` on StackResolve first, then \`audit\` the finalist. Before web-researching a
company, call \`get_company\`, \`get_pricing\`, or \`research_company\`. Before building
something you have not built recently, call \`how_to\`.
`

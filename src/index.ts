/**
 * StackResolve official TypeScript/Node SDK.
 *
 * A thin, typed wrapper over the StackResolve REST API. It gives agents and
 * developers Firecrawl/Exa-style ergonomics over AgentReady (discover, evaluate,
 * select, install, and use software) and CompanyData (structured company research).
 *
 * Requires Node 18+ (uses the built-in global `fetch`). No runtime dependencies.
 *
 *   import { StackResolve } from 'stackresolve'
 *   const sr = new StackResolve({ apiKey: process.env.STACKRESOLVE_API_KEY })
 *   const report = await sr.audit('stripe.com')
 */

const DEFAULT_BASE_URL = 'https://api.stackresolve.dev'

export interface StackResolveOptions {
  /** API key. Falls back to the STACKRESOLVE_API_KEY env var. Optional for public endpoints. */
  apiKey?: string
  /** Base URL override. Falls back to STACKRESOLVE_BASE_URL, then https://api.stackresolve.dev . */
  baseUrl?: string
  /** Optional custom fetch (defaults to the global fetch). */
  fetch?: typeof fetch
}

/** Thrown on any non-2xx API response. Carries the HTTP status and the parsed body. */
export class StackResolveError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `StackResolve API error ${status}`)
    this.name = 'StackResolveError'
    this.status = status
    this.body = body
  }
}

type Json = Record<string, unknown>
type HttpMethod = 'GET' | 'POST' | 'PATCH'

// ---- well-known response shapes (mirrored from the engine return types) ----
// Fields we saw in the engine are typed; unknown extras stay accessible via the
// permissive index signatures where a shape can grow.

export interface Scores {
  agentready: number | null
  discovery: number | null
  understanding: number | null
  adoption: number | null
  operability: number | null
}

export interface AuditReport {
  slug: string
  domain: string
  name: string
  scores: Scores
  facts: Record<string, unknown>
  issues: string[]
  refreshed: Record<string, string[]>
  signals: Record<string, unknown>
  [key: string]: unknown
}

export interface Profile {
  slug: string
  name: string
  domain: string | null
  scores: Scores | null
  facts: Record<string, Record<string, { value: unknown; confidence: number; observedAt: string; stale: boolean }>>
  claimed: boolean
  lastChecked: string | null
}

export interface RegistryRow {
  slug: string
  name: string
  domain: string | null
  agentready: number | null
  discovery: number | null
  understanding: number | null
  adoption: number | null
  operability: number | null
}

export interface CategoryRow {
  slug: string
  name: string
  agent_task: string
  count: number
}

export interface CategoryDetail {
  category: { slug: string; name: string; agent_task: string }
  products: Array<{ slug: string; name: string; domain: string | null; agentready: number | null }>
}

export interface SearchRequirements {
  api?: boolean
  mcp?: boolean
  self_serve?: boolean
  openapi?: boolean
  cli?: boolean
}

export interface SearchResultRow {
  slug: string
  name: string
  domain: string | null
  agentready: number | null
}

export interface FindToolsResult {
  task: string
  intent: { searchTerms: string; requirements: SearchRequirements }
  results: SearchResultRow[]
  [key: string]: unknown
}

export interface ResolveResultRow extends SearchResultRow {
  matched: string[]      // capability slugs this product exposes that the task needs
  capScore: number       // ranking weight
  reason: string         // agent-readable why-it-fits
}
export interface ResolveResult {
  task: string
  capabilities: string[]           // the capabilities the task needs
  requirements: SearchRequirements
  results: ResolveResultRow[]
  discovered?: number              // new products audited into the registry this call
  note?: string                    // honest coverage note
}

export interface HowToTool { name: string; slug: string; agentready: number | null; why: string }
export interface HowToResult {
  task: string
  asOf: string                 // the month + year the answer is anchored to
  approach: string
  recommendedTools: HowToTool[]
  steps: string[]
  gotchas: string[]
  deprecated: string[]
  sources: string[]
}

export interface CompareResult {
  fields: string[]
  rows: Array<{ slug: string; name: string; values: Record<string, unknown> }>
}

export interface CompanyRecord {
  name: string
  domain: string
  description?: unknown
  products?: unknown
  categories?: unknown
  executives?: unknown
  funding?: unknown
  technology?: unknown
  recent_news?: unknown
  freshness: Record<string, { observedAt: string; stale: boolean }>
  cached: boolean
  [key: string]: unknown
}

export interface PricingRecord {
  domain: string
  pricing?: unknown
  free_tier?: unknown
  self_serve?: unknown
  freshness: Record<string, { observedAt: string; stale: boolean }>
  cached: boolean
  [key: string]: unknown
}

export interface Competitor {
  name: string
  domain?: string
}

export interface CompetitorsResult {
  domain: string
  competitors: Competitor[]
  [key: string]: unknown
}

export interface CompareCompaniesResult {
  fields: string[]
  rows: Array<{ domain: string; name: string; values: Record<string, unknown> }>
}

export interface ResearchResult {
  domain: string
  question: string
  answer: string
  sources: string[]
  [key: string]: unknown
}

export interface GenerateSummary {
  found: boolean
  apiTitle?: string
  baseUrl?: string
  operationCount?: number
  authType?: string
  hasLlmsTxt?: boolean
  specUrl?: string
  message?: string
}

export interface GenerateResult {
  summary: GenerateSummary
  mcpServer?: string
  cli?: string
  llmsTxt?: string
  claudeCode?: string
  cursor?: string
  codex?: string
  readme?: string
}

export interface DeployResult {
  found: boolean
  slug?: string
  mcpUrl?: string
  toolCount?: number
  apiTitle?: string
  baseUrl?: string
  message?: string
}

export interface DiscoveryVisibility {
  mentionRatePct: number
  avgPosition: number | null
  recoSharePct: number
  notFound: number
  numberOne: number
  trackedPrompts: number
  prev: { mentionRatePct: number; avgPosition: number | null; recoSharePct: number; notFound: number } | null
}

export interface DiscoveryQueryView {
  text: string
  claude: string
  codex: string
  cursor: string
  share: string
  trend: string
  up: boolean | null
  summary: string
  advice: string
  competitors: Array<{ name: string; pos: string }>
}

export interface DiscoveryView {
  queries: DiscoveryQueryView[]
  visibility: DiscoveryVisibility | null
  updatedAt: string | null
}

export interface ScoreHistory {
  series: { Overall: number[]; Discover: number[]; Understand: number[]; Adopt: number[]; Operate: number[] }
  days: string[]
  events: Array<{ day: string; pillar: string; label: string; delta: number; up: boolean }>
}

export type Cadence = 'daily' | 'weekly'
export type MonitorKind = 'discovery' | 'score'

export interface MonitorRow {
  id: string
  slug: string
  name: string
  cadence: Cadence
  kinds: MonitorKind[]
  enabled: boolean
  score: number | null
  avgPosition: number | null
  lastRunAt: string | null
  nextRunAt: string
}

export interface MonitorEvent {
  id: string
  slug: string
  name: string
  kind: string
  message: string
  delta: number | null
  createdAt: string
}

export interface MonitorsView {
  monitors: MonitorRow[]
  events: MonitorEvent[]
}

export interface RunMonitorNowResult {
  result: Record<string, unknown>
  view: MonitorsView
}

export interface MonitorOptions {
  cadence?: Cadence
  kinds?: MonitorKind[]
  enabled?: boolean
}

export interface RegistryQuery {
  category?: string
  minScore?: number
  limit?: number
}

/** The StackResolve API client. */
export class StackResolve {
  private readonly apiKey: string | undefined
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(options: StackResolveOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.STACKRESOLVE_API_KEY
    const base = options.baseUrl ?? process.env.STACKRESOLVE_BASE_URL ?? DEFAULT_BASE_URL
    this.baseUrl = base.replace(/\/+$/, '')
    const f = options.fetch ?? globalThis.fetch
    if (typeof f !== 'function') {
      throw new Error('global fetch is not available. Use Node 18+ or pass a fetch implementation via options.fetch.')
    }
    this.fetchImpl = f
  }

  // ---- core transport ----

  private async request<T>(method: HttpMethod, path: string, body?: Json): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (this.apiKey) headers['x-api-key'] = this.apiKey
    const init: RequestInit = { method, headers }
    if (body !== undefined && (method === 'POST' || method === 'PATCH')) {
      headers['content-type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    const res = await this.fetchImpl(this.baseUrl + path, init)
    const text = await res.text()
    let parsed: unknown = undefined
    if (text) {
      try { parsed = JSON.parse(text) } catch { parsed = text }
    }
    if (!res.ok) {
      const msg =
        parsed && typeof parsed === 'object' && 'error' in (parsed as Json)
          ? String((parsed as Json).error)
          : `StackResolve API error ${res.status}`
      throw new StackResolveError(res.status, parsed, msg)
    }
    return parsed as T
  }

  private qs(params: Record<string, string | number | undefined>): string {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') sp.set(k, String(v))
    }
    const s = sp.toString()
    return s ? `?${s}` : ''
  }

  // ---- AgentReady: discovery, evaluation, profiles ----

  /** Audit a domain and return its AgentReady scores, facts, and issues. */
  audit(domain: string): Promise<AuditReport> {
    return this.request<AuditReport>('POST', '/v1/audit', { domain })
  }

  /** Turn a natural-language task into ranked, agent-ready tool candidates. */
  findTools(task: string): Promise<FindToolsResult> {
    return this.request<FindToolsResult>('POST', '/v1/find-tools', { task })
  }

  /**
   * Call this BEFORE building something. Returns the CURRENT (date-stamped), cited,
   * tool-aware way to do a task, so you build from today's best practice instead of
   * training-cutoff memory. Composes live web research + the tool resolver + one
   * synthesis pass.
   */
  howTo(task: string): Promise<HowToResult> {
    return this.request<HowToResult>('POST', '/v1/how-to', { task })
  }

  /**
   * Resolve a natural-language task to the capabilities it needs, then to the products
   * that expose them, ranked with a reason each. Optional requirements filter candidates
   * (api/mcp/self_serve/openapi/cli). Set opts.discover to search the web and audit new
   * products into the registry when coverage is thin (slower, costs more).
   */
  resolve(task: string, opts?: { requirements?: SearchRequirements; discover?: boolean }): Promise<ResolveResult> {
    const body: Json = { task }
    if (opts?.requirements) body.requirements = opts.requirements
    if (opts?.discover) body.discover = true
    return this.request<ResolveResult>('POST', '/v1/resolve', body)
  }

  /**
   * Mint a fresh API key and workspace with no prior login (rate-limited). Returns the
   * key once; store it. This is what `stackresolve keys create` calls.
   */
  createKey(label?: string): Promise<{ key: string; id: string; workspaceId: string }> {
    return this.request<{ key: string; id: string; workspaceId: string }>('POST', '/v1/keys', label ? { label } : {})
  }

  /** Keyword search over the registry, optionally filtered by hard requirements. */
  search(query: string, requirements?: SearchRequirements): Promise<SearchResultRow[]> {
    const body: Json = { query }
    if (requirements) body.requirements = requirements
    return this.request<SearchResultRow[]>('POST', '/v1/search', body)
  }

  /** Compare products side by side by slug. */
  compare(slugs: string[]): Promise<CompareResult> {
    return this.request<CompareResult>('POST', '/v1/compare', { slugs })
  }

  /** Fetch a single product profile (scores + facts) by slug. */
  getProfile(slug: string): Promise<Profile | null> {
    return this.request<Profile | null>('GET', `/v1/profile/${encodeURIComponent(slug)}`)
  }

  /** List registry rows, optionally filtered by category, minimum score, and limit. */
  listRegistry(opts?: RegistryQuery): Promise<RegistryRow[]> {
    const path = '/v1/registry' + this.qs({ category: opts?.category, minScore: opts?.minScore, limit: opts?.limit })
    return this.request<RegistryRow[]>('GET', path)
  }

  /** List all categories. */
  async getCategories(): Promise<CategoryRow[]> {
    const r = await this.request<{ categories: CategoryRow[] }>('GET', '/v1/categories')
    return r.categories
  }

  /** Fetch one category and its products by slug. */
  getCategory(slug: string): Promise<CategoryDetail | null> {
    return this.request<CategoryDetail | null>('GET', `/v1/categories/${encodeURIComponent(slug)}`)
  }

  // ---- CompanyData: structured company research ----

  /** Structured company profile for a domain. */
  getCompany(domain: string): Promise<CompanyRecord> {
    return this.request<CompanyRecord>('POST', '/v1/company', { domain })
  }

  /**
   * Structured pricing for a domain.
   * Note: the API reads `domain` from the query string for this endpoint, not the body.
   */
  getPricing(domain: string): Promise<PricingRecord> {
    return this.request<PricingRecord>('POST', '/v1/pricing' + this.qs({ domain }))
  }

  /**
   * Competitors and alternatives for a domain.
   * Note: the API reads `domain` from the query string for this endpoint, not the body.
   */
  getCompetitors(domain: string): Promise<CompetitorsResult> {
    return this.request<CompetitorsResult>('POST', '/v1/competitors' + this.qs({ domain }))
  }

  /** Grounded research answer about a domain, optionally scoped to a question. */
  research(domain: string, question?: string): Promise<ResearchResult> {
    const body: Json = { domain }
    if (question) body.question = question
    return this.request<ResearchResult>('POST', '/v1/research', body)
  }

  /** Compare multiple companies by domain. */
  compareCompanies(domains: string[]): Promise<CompareCompaniesResult> {
    return this.request<CompareCompaniesResult>('POST', '/v1/compare-companies', { domains })
  }

  // ---- Agent-native interface generation + hosting ----

  /** Generate agent-native interfaces (MCP server, CLI, llms.txt, snippets) for a domain. */
  generate(domain: string, openapiUrl?: string): Promise<GenerateResult> {
    const body: Json = { domain }
    if (openapiUrl) body.openapiUrl = openapiUrl
    return this.request<GenerateResult>('POST', '/v1/generate', body)
  }

  /** Deploy a hosted MCP server for a domain. */
  deploy(domain: string, openapiUrl?: string): Promise<DeployResult> {
    const body: Json = { domain }
    if (openapiUrl) body.openapiUrl = openapiUrl
    return this.request<DeployResult>('POST', '/v1/deploy', body)
  }

  // ---- Agent Discovery + Score History ----

  /** Read the latest Agent Discovery view for a slug. */
  getDiscovery(slug: string): Promise<DiscoveryView> {
    return this.request<DiscoveryView>('GET', '/v1/discovery' + this.qs({ slug }))
  }

  /** Run an Agent Discovery check for a slug (requires an API key; spends credits). */
  runDiscovery(slug: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('POST', '/v1/discovery/run', { slug })
  }

  /** Read the score-history timeseries for a slug. */
  getScoreHistory(slug: string): Promise<ScoreHistory> {
    return this.request<ScoreHistory>('GET', '/v1/score-history' + this.qs({ slug }))
  }

  // ---- Monitors (require an API key) ----

  /** List monitors for the authenticated workspace. */
  listMonitors(): Promise<MonitorsView> {
    return this.request<MonitorsView>('GET', '/v1/monitors')
  }

  /** Create or update a monitor for a slug. */
  addMonitor(slug: string, opts?: MonitorOptions): Promise<MonitorsView> {
    const body: Json = { slug }
    if (opts?.cadence) body.cadence = opts.cadence
    if (opts?.kinds) body.kinds = opts.kinds
    if (typeof opts?.enabled === 'boolean') body.enabled = opts.enabled
    return this.request<MonitorsView>('POST', '/v1/monitors', body)
  }

  /** Run a monitor immediately for a slug. */
  runMonitorNow(slug: string): Promise<RunMonitorNowResult> {
    return this.request<RunMonitorNowResult>('POST', '/v1/monitors/run-now', { slug })
  }

  // ---- Account (require an API key) ----

  /** Usage for the authenticated workspace. */
  getUsage(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>('GET', '/v1/usage')
  }

  /** The authenticated workspace's own claimed profile (or null). */
  getMyProfile(): Promise<{ profile: Record<string, unknown> | null }> {
    return this.request<{ profile: Record<string, unknown> | null }>('GET', '/v1/me/profile')
  }
}

export default StackResolve

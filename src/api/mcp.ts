/**
 * octo-marketplace admin client.
 *
 * Distinct from the shared `../api` axios instance because marketplace has
 * its own base path (/market/api/v1 per octo-marketplace/docs/api/mcp-v1.md
 * §1) and its own auth header (X-Admin-Token). The primary admin backend's
 * `token` header is not accepted by marketplace and shouldn't leak into
 * these requests.
 *
 * Error envelope also differs — marketplace ships `{err:{code,message}}`
 * (doc §2) while the admin backend uses `{error:{code,http_status,message}}`.
 * We map the marketplace shape into `ApiError` so callers see one exception
 * type regardless of backend.
 */

import axios, { AxiosError } from 'axios'
import i18n, { FALLBACK_LANGUAGE } from '../i18n'
import { ApiError } from './index'

const MARKETPLACE_BASE =
  import.meta.env.VITE_MARKETPLACE_API_BASE || '/market/api/v1'
const ADMIN_TOKEN = import.meta.env.VITE_MARKETPLACE_ADMIN_TOKEN || ''

const mcpApi = axios.create({
  baseURL: MARKETPLACE_BASE,
  timeout: 30000,
})

mcpApi.interceptors.request.use((config) => {
  if (ADMIN_TOKEN) {
    config.headers['X-Admin-Token'] = ADMIN_TOKEN
  }
  config.headers['Accept-Language'] =
    i18n.resolvedLanguage ?? FALLBACK_LANGUAGE
  return config
})

mcpApi.interceptors.response.use(
  (response) => response,
  (
    error: AxiosError<{
      err?: { code?: string; message?: string }
    }>
  ) => {
    const wire = error.response?.data?.err
    const message = wire?.message || wire?.code || error.message
    return Promise.reject(
      new ApiError(message, error.response?.status, wire?.code)
    )
  }
)

// ─── Types (mirrors octo-marketplace/docs/api/mcp-v1.md §3) ───────────────

export type McpVisibility = 'public' | 'private' | 'system'
export type McpTransport = 'stdio' | 'streamable-http' | 'sse'
export type McpAuthType = 'bearer' | 'none'

export interface McpTool {
  name: string
  description: string
}

export interface McpFaq {
  question: string
  answer: string
}

export interface McpQuickStart {
  transport: McpTransport
  serverName: string
  /** ASCII identifier used as the JSON key in the generated mcpServers
   *  snippet (mcp-v1.md §3, "服务标识"). Present on records created after
   *  migration 03; matches `^[a-z0-9-]{1,64}$`. Empty on legacy rows. */
  slug?: string
  url?: string
  authType?: McpAuthType
  headers?: Record<string, string>
  command?: string
  args?: string[]
  env?: Record<string, string>
}

/** List projection returned by GET /admin/api/v1/mcps (doc §3.2 superset). */
export interface McpListItem {
  id: string
  name: string
  slogan: string
  category: string
  icon: string
  tags: string[]
  toolCount: number
  visibility: McpVisibility
  creatorName: string
}

/** Full record returned by POST/GET/PATCH /admin/api/v1/mcps (doc §3.1). */
export interface McpDetail extends McpListItem {
  quickStart: McpQuickStart
  tools: McpTool[]
  usageExamples: string[]
  faqs: McpFaq[]
  notes: string[]
  createdAt: string
  updatedAt: string
}

/** Create body — flat shape per doc §3.3. Visibility is stripped by the
 *  admin endpoint (always stamped to `system`) so callers may omit it. */
export interface CreateMcpParams {
  name: string
  /** Optional ASCII identifier. When empty the server auto-slugifies name.
   *  Must match `^[a-z0-9-]{1,64}$` when provided. */
  slug?: string
  category: string
  icon?: string
  tags?: string[]
  slogan?: string
  transport: McpTransport
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
  authType?: McpAuthType
  tools: McpTool[]
  usageExamples?: string[]
  faqs?: McpFaq[]
  notes?: string[]
}

export interface ListMcpParams {
  keyword?: string
  category?: string
  limit?: number
  offset?: number
}

export interface ListMcpResponse {
  items: McpListItem[]
  total: number
  categories: { key: string; count: number }[]
}

/** PATCH body — every field optional (doc §4.5 shape). The marketplace admin
 *  surface rejects any `visibility` other than "system"; we omit it so callers
 *  cannot accidentally demote a system MCP. */
export interface PatchMcpParams {
  name?: string
  slug?: string
  category?: string
  icon?: string
  tags?: string[]
  slogan?: string
  transport?: McpTransport
  url?: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
  authType?: McpAuthType
  tools?: McpTool[]
  usageExamples?: string[]
  faqs?: McpFaq[]
  notes?: string[]
}

// ─── Public functions ─────────────────────────────────────────────────────

/** GET /admin/api/v1/mcps — list every visibility=system record. */
export async function listSystemMcps(
  params: ListMcpParams = {}
): Promise<ListMcpResponse> {
  const query: Record<string, unknown> = {}
  const keyword = params.keyword?.trim()
  if (keyword) query.keyword = keyword
  query.category = params.category ?? 'all'
  if (params.limit && params.limit > 0) query.limit = params.limit
  if (params.offset && params.offset > 0) query.offset = params.offset
  const resp = await mcpApi.get<ListMcpResponse>('/admin/mcps', {
    params: query,
  })
  return resp.data
}

/** POST /admin/api/v1/mcps — create a system MCP. */
export async function createSystemMcp(
  params: CreateMcpParams
): Promise<McpDetail> {
  const resp = await mcpApi.post<McpDetail>('/admin/mcps', params)
  return resp.data
}

/** GET /admin/api/v1/mcps/{id} — fetch full detail for a system MCP. */
export async function getSystemMcp(id: string): Promise<McpDetail> {
  const resp = await mcpApi.get<McpDetail>(`/admin/mcps/${encodeURIComponent(id)}`)
  return resp.data
}

/** PATCH /admin/api/v1/mcps/{id} — partial update. Any admin can edit any
 *  system MCP (no ownership check server-side). */
export async function updateSystemMcp(
  id: string,
  params: PatchMcpParams
): Promise<McpDetail> {
  const resp = await mcpApi.patch<McpDetail>(
    `/admin/mcps/${encodeURIComponent(id)}`,
    params
  )
  return resp.data
}

/** DELETE /admin/api/v1/mcps/{id} — soft delete. */
export async function deleteSystemMcp(id: string): Promise<void> {
  await mcpApi.delete(`/admin/mcps/${encodeURIComponent(id)}`)
}

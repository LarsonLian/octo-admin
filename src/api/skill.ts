/**
 * octo-marketplace admin Skill management client.
 *
 * Uses the same mcpApi axios instance pattern (marketplace base URL + X-Admin-Token).
 * Endpoints: /admin/skill_categories and /admin/skills.
 *
 * The backend response envelope for lists is:
 *   { data: T[], pagination: { total, page, page_size } }
 * For single items:
 *   { data: T }
 */

import axios, { AxiosError } from 'axios'
import i18n, { FALLBACK_LANGUAGE } from '../i18n'
import { ApiError } from './index'

const MARKETPLACE_BASE =
  import.meta.env.VITE_MARKETPLACE_API_BASE || '/market/api/v1'
const ADMIN_TOKEN = import.meta.env.VITE_MARKETPLACE_ADMIN_TOKEN || ''

const skillApi = axios.create({
  baseURL: MARKETPLACE_BASE,
  timeout: 30000,
})

skillApi.interceptors.request.use((config) => {
  if (ADMIN_TOKEN) {
    config.headers['X-Admin-Token'] = ADMIN_TOKEN
  }
  config.headers['Accept-Language'] =
    i18n.resolvedLanguage ?? FALLBACK_LANGUAGE
  return config
})

skillApi.interceptors.response.use(
  (response) => response,
  (
    error: AxiosError<{
      error?: { code?: string; message?: string; details?: Record<string, unknown> }
    }>
  ) => {
    const wire = error.response?.data?.error
    const message = wire?.message || wire?.code || error.message
    return Promise.reject(
      new ApiError(message, error.response?.status, wire?.code)
    )
  }
)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CategoryItem {
  skill_category_id: string
  name: string
  icon_key: string
  sort_order: number
}

export interface SkillListItem {
  skill_id: string
  name: string
  display_name: string
  icon_url: string
  description: string
  category_id: string
  tags: string[]
  owner_name: string
  visibility: string
  version: string
  file_name: string
  file_size: number
  view_count: number
  download_count: number
  created_at: string
  updated_at: string
}

export interface SkillDetail extends SkillListItem {
  readme_content?: string
}

export interface ListSkillsParams {
  q?: string
  category_id?: string
  tags?: string
  sort?: string
  offset?: number
  page_size?: number
}

export interface ListSkillsResponse {
  items: SkillListItem[]
  total: number
  page: number
  page_size: number
}

export interface CreateSkillParams {
  parse_task_id: string
  name?: string
  display_name?: string
  description?: string
  category_id?: string
  tags?: string[]
  version?: string
}

export interface PatchSkillParams {
  name?: string
  description?: string
  category_id?: string
  tags?: string[]
  icon_url?: string
}

// ─── Category API ────────────────────────────────────────────────────────────

export async function listSkillCategories(): Promise<CategoryItem[]> {
  const resp = await skillApi.get<{ data: CategoryItem[] }>('/admin/skill_categories')
  return resp.data.data
}

export async function createSkillCategory(params: {
  name: string
  sort_order?: number
}): Promise<CategoryItem> {
  const resp = await skillApi.post<{ data: CategoryItem }>('/admin/skill_categories', params)
  return resp.data.data
}

export async function updateSkillCategory(
  id: string,
  params: { name?: string; sort_order?: number }
): Promise<CategoryItem> {
  const resp = await skillApi.patch<{ data: CategoryItem }>(
    `/admin/skill_categories/${encodeURIComponent(id)}`,
    params
  )
  return resp.data.data
}

export async function deleteSkillCategory(id: string): Promise<void> {
  await skillApi.delete(`/admin/skill_categories/${encodeURIComponent(id)}`)
}

// ─── Skill API ───────────────────────────────────────────────────────────────

/**
 * List admin skills. Backend returns:
 *   { data: SkillItem[], pagination: { total, page, page_size } }
 */
export async function listAdminSkills(
  params: ListSkillsParams = {}
): Promise<ListSkillsResponse> {
  const query: Record<string, unknown> = {}
  if (params.q?.trim()) query.q = params.q.trim()
  if (params.category_id) query.category_id = params.category_id
  if (params.tags) query.tags = params.tags
  if (params.sort) query.sort = params.sort
  if (params.offset != null && params.offset > 0) query.offset = params.offset
  if (params.page_size && params.page_size > 0) query.page_size = params.page_size
  const resp = await skillApi.get<{
    data: SkillListItem[]
    pagination: { total: number; page: number; page_size: number }
  }>('/admin/skills', { params: query })
  return {
    items: resp.data.data,
    total: resp.data.pagination.total,
    page: resp.data.pagination.page,
    page_size: resp.data.pagination.page_size,
  }
}

export async function getAdminSkill(id: string): Promise<SkillDetail> {
  const resp = await skillApi.get<{ data: SkillDetail }>(
    `/admin/skills/${encodeURIComponent(id)}`
  )
  return resp.data.data
}

export async function createAdminSkill(params: CreateSkillParams): Promise<SkillDetail> {
  const resp = await skillApi.post<{ data: SkillDetail }>('/admin/skills', params)
  return resp.data.data
}

export async function updateAdminSkill(
  id: string,
  params: PatchSkillParams
): Promise<SkillDetail> {
  const resp = await skillApi.patch<{ data: SkillDetail }>(
    `/admin/skills/${encodeURIComponent(id)}`,
    params
  )
  return resp.data.data
}

export async function deleteAdminSkill(id: string): Promise<void> {
  await skillApi.delete(`/admin/skills/${encodeURIComponent(id)}`)
}

export async function getSkillMd(id: string): Promise<string> {
  const resp = await skillApi.get(`/admin/skills/${encodeURIComponent(id)}/skill-md`, {
    responseType: 'text',
    transformResponse: [(data: string) => data],
  })
  return resp.data as string
}

// ─── Download ────────────────────────────────────────────────────────────────

export interface DownloadInfo {
  download_url: string
  file_sha256: string
}

/** Get a presigned download URL for a public skill archive (admin). */
export async function getAdminSkillDownloadUrl(id: string): Promise<string> {
  const resp = await skillApi.get<{ data: DownloadInfo }>(
    `/admin/skills/${encodeURIComponent(id)}/download`,
    { params: { format: 'json' } }
  )
  return resp.data.data.download_url
}

// ─── Upload flow (presigned URL) ─────────────────────────────────────────────

/**
 * The admin upload flow:
 * 1. POST /admin/skill_uploads { file_name, file_size } → { skill_upload_id, presigned_url, method, headers }
 * 2. PUT file bytes to presigned_url
 * 3. POST /admin/skill_uploads/:id/parse → { skill_parse_task_id }
 * 4. GET /admin/skill_parse_tasks/:id → poll until status=success
 * 5. POST /admin/skills { parse_task_id, name, ... } → created skill
 */

export interface InitUploadResult {
  skill_upload_id: string
  presigned_url: string
  method: string
  headers: Record<string, string>
  object_key: string
}

export async function initAdminSkillUpload(fileName: string, fileSize: number): Promise<InitUploadResult> {
  const resp = await skillApi.post<{ data: InitUploadResult }>('/admin/skill_uploads', {
    file_name: fileName,
    file_size: fileSize,
  })
  return resp.data.data
}

export async function triggerAdminParse(uploadId: string): Promise<string> {
  const resp = await skillApi.post<{ data: { skill_parse_task_id: string } }>(
    `/admin/skill_uploads/${encodeURIComponent(uploadId)}/parse`
  )
  return resp.data.data.skill_parse_task_id
}

export interface ParseTaskResult {
  status: string
  skill_parse_task_id: string
  result?: {
    name: string
    description?: string
    version: string
    tags: string[]
    readme_content?: string
    file_name: string
    file_size: number
    file_sha256: string
  }
  error?: { code: string; message: string }
}

export async function pollAdminParseTask(taskId: string): Promise<ParseTaskResult> {
  const resp = await skillApi.get<{ data: ParseTaskResult }>(
    `/admin/skill_parse_tasks/${encodeURIComponent(taskId)}`
  )
  return resp.data.data
}

/**
 * Full upload + parse flow for admin skill creation.
 * Returns the parse_task_id once parsing completes successfully.
 * Throws on failure.
 */
export async function uploadAndParseSkillZip(
  file: File,
  onProgress?: (stage: 'uploading' | 'parsing', progress?: number) => void
): Promise<{ parseTaskId: string; result: ParseTaskResult['result'] }> {
  // 1. Init upload
  onProgress?.('uploading')
  const init = await initAdminSkillUpload(file.name, file.size)

  // 2. PUT file to presigned URL
  const putResp = await fetch(init.presigned_url, {
    method: init.method || 'PUT',
    headers: init.headers ?? {},
    body: file,
  })
  if (!putResp.ok) {
    throw new ApiError(`Upload failed (${putResp.status})`, putResp.status)
  }

  // 3. Trigger parse
  onProgress?.('parsing')
  const taskId = await triggerAdminParse(init.skill_upload_id)

  // 4. Poll until done
  const maxAttempts = 60
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const task = await pollAdminParseTask(taskId)
    if (task.status === 'success') {
      return { parseTaskId: taskId, result: task.result }
    }
    if (task.status === 'failed') {
      throw new ApiError(
        task.error?.message || 'Parse failed',
        400,
        task.error?.code
      )
    }
    // still parsing — continue polling
  }
  throw new ApiError('Parse timed out', 408)
}

/** Reupload flow: same presigned steps, then call /admin/skills/:id/reupload with parse_task_id. */
export async function reuploadAdminSkill(
  skillId: string,
  file: File,
  params: { version?: string; changelog?: string; tags?: string[] },
  onProgress?: (stage: 'uploading' | 'parsing') => void
): Promise<SkillDetail> {
  const { parseTaskId } = await uploadAndParseSkillZip(file, onProgress)
  const resp = await skillApi.post<{ data: SkillDetail }>(
    `/admin/skills/${encodeURIComponent(skillId)}/reupload`,
    {
      parse_task_id: parseTaskId,
      version: params.version,
      changelog: params.changelog,
      tags: params.tags,
    }
  )
  return resp.data.data
}

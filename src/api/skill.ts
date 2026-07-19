/**
 * octo-marketplace admin Skill management client.
 *
 * Uses the same mcpApi axios instance pattern (marketplace base URL + X-Admin-Token).
 * Endpoints: /admin/skill_categories and /admin/skills.
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
  // Additional detail fields if any
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
  const resp = await skillApi.get<{ data: ListSkillsResponse }>('/admin/skills', {
    params: query,
  })
  return resp.data.data
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

export async function reuploadSkillZip(id: string, file: File): Promise<void> {
  const formData = new FormData()
  formData.append('file', file)
  await skillApi.post(
    `/admin/skills/${encodeURIComponent(id)}/reupload`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
}

// ─── Upload flow ─────────────────────────────────────────────────────────────

export async function uploadSkillZip(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const resp = await skillApi.post<{ data: { parse_task_id: string } }>(
    '/uploads/skill',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  )
  return resp.data.data.parse_task_id
}

export interface ParseTaskResult {
  status: string
  result_name?: string
  result_description?: string
  result_version?: string
  result_tags?: string[]
  error?: string
}

export async function getParseTaskStatus(id: string): Promise<ParseTaskResult> {
  const resp = await skillApi.get<{ data: ParseTaskResult }>(
    `/uploads/skill/${encodeURIComponent(id)}`
  )
  return resp.data.data
}

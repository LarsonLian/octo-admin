import axios, { AxiosError } from 'axios'
import i18n, { FALLBACK_LANGUAGE } from '../i18n'
import { useAuthStore } from '../store/auth'
import { ApiError } from './index'

// ─── Marketplace axios instance (独立于主 api，走 /market 前缀) ───

const MARKET_BASE = import.meta.env.VITE_MARKET_API_BASE || '/market/api/v1'

const marketApi = axios.create({
  baseURL: MARKET_BASE,
  timeout: 30000,
})

marketApi.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.token = token
  }
  config.headers['Accept-Language'] = i18n.resolvedLanguage ?? FALLBACK_LANGUAGE
  return config
})

marketApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: { code?: string; message?: string }; msg?: string }>) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/admin/login'
    }
    const errorEnvelope = error.response?.data?.error
    const message = errorEnvelope?.message || error.response?.data?.msg || error.message
    const status = error.response?.status
    return Promise.reject(new ApiError(message, status, errorEnvelope?.code))
  },
)

// ─── Helpers ───

// Marketplace API wraps responses as { code: 0, data: T }
const unwrap = <T>(p: Promise<{ data: { code: number; data: T; message?: string } }>): Promise<T> =>
  p.then((r) => {
    if (r.data.code !== 0) {
      throw new ApiError(r.data.message || 'Request failed', undefined, String(r.data.code))
    }
    return r.data.data
  })

// ─── Types ───

export interface SkillListItem {
  id: string
  name: string
  display_name: string
  icon_url: string
  description: string
  category_id: string
  category_name?: string
  tags: string[]
  owner_name: string
  visibility: 'public' | 'space' | 'private'
  version: string
  created_at: string
  updated_at: string
}

export interface SkillDetail extends SkillListItem {
  readme_content: string
  file_name: string
  file_url: string
  file_size: number
  file_sha256: string
  owner_id: string
  space_id: string
}

export interface CategoryItem {
  id: string
  name: string
  icon_key: string
  skill_count: number
}

export interface UploadInitResponse {
  upload_id: string
  presigned_url: string
}

export interface ParseTaskStatus {
  id: string
  status: 'pending' | 'parsing' | 'success' | 'failed'
  error_message?: string
  result_name?: string
  result_description?: string
  result_version?: string
  result_tags?: string[]
  result_readme?: string
}

export interface CreateSkillParams {
  upload_id: string
  name: string
  display_name: string
  description: string
  category_id: string
  tags: string[]
  visibility: 'public' | 'space' | 'private'
  icon_url?: string
}

export interface UpdateSkillParams {
  display_name?: string
  description?: string
  category_id?: string
  tags?: string[]
  visibility?: 'public' | 'space' | 'private'
  icon_url?: string
}

export interface SkillListParams {
  q?: string
  category_id?: string
  cursor?: string
  limit?: number
}

export interface SkillListResponse {
  items: SkillListItem[]
  next_cursor: string | null
}

// ─── Skill endpoints ───

export const listSkills = (params: SkillListParams = {}): Promise<SkillListResponse> =>
  unwrap(marketApi.get('/skill', { params }))

export const getSkill = (id: string): Promise<SkillDetail> =>
  unwrap(marketApi.get(`/skill/${id}`))

export const deleteSkill = (id: string): Promise<void> =>
  marketApi.delete(`/skill/${id}`).then(() => undefined)

export const updateSkill = (id: string, data: UpdateSkillParams): Promise<SkillDetail> =>
  unwrap(marketApi.put(`/skill/${id}`, data))

// ─── Upload & Publish flow ───

export const uploadInit = (file_name: string, file_size: number): Promise<UploadInitResponse> =>
  unwrap(marketApi.post('/skill/upload/init', { file_name, file_size }))

export const uploadToPresigned = async (presignedUrl: string, file: File): Promise<void> => {
  await axios.put(presignedUrl, file, {
    headers: { 'Content-Type': 'application/octet-stream' },
  })
}

export const triggerParse = (upload_id: string): Promise<{ task_id: string }> =>
  unwrap(marketApi.post(`/skill/upload/${upload_id}/parse`, {}))

export const getParseStatus = (task_id: string): Promise<ParseTaskStatus> =>
  unwrap(marketApi.get(`/skill/parse/${task_id}`))

export const createSkill = (data: CreateSkillParams): Promise<SkillDetail> =>
  unwrap(marketApi.post('/skill', data))

export const uploadIcon = async (file: File): Promise<{ object_key: string }> => {
  const formData = new FormData()
  formData.append('file', file)
  return unwrap(marketApi.post('/skill/upload/icon', formData))
}

// ─── Category endpoints ───

export const listCategories = (): Promise<CategoryItem[]> =>
  unwrap(marketApi.get('/skill/categories'))

export const createCategory = (data: { name: string; icon_key: string }): Promise<CategoryItem> =>
  unwrap(marketApi.post('/skill/categories', data))

export const updateCategory = (id: string, data: { name?: string; icon_key?: string }): Promise<CategoryItem> =>
  unwrap(marketApi.put(`/skill/categories/${id}`, data))

export const deleteCategory = (id: string): Promise<void> =>
  marketApi.delete(`/skill/categories/${id}`).then(() => undefined)

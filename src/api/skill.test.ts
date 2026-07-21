import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPost = vi.hoisted(() => vi.fn())
const mockUseAuthStore = vi.hoisted(() => ({
  getState: vi.fn(() => ({ token: 'token-1', logout: vi.fn() })),
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: vi.fn(),
      post: mockPost,
      patch: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}))

vi.mock('../store/auth', () => ({
  useAuthStore: mockUseAuthStore,
}))

vi.mock('../i18n', () => ({
  default: { resolvedLanguage: 'zh-CN' },
  FALLBACK_LANGUAGE: 'zh-CN',
}))

import { commitAdminSkillReupload } from './skill'

describe('commitAdminSkillReupload', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockPost.mockResolvedValue({
      data: {
        data: {
          skill_id: 'skill-1',
          name: 'skill-one',
          display_name: 'Skill One',
          tags: ['tag-1'],
          version: '1.0.1',
        },
      },
    })
  })

  it('commits an already parsed reupload task through the reupload endpoint', async () => {
    const result = await commitAdminSkillReupload('skill-1', {
      parse_task_id: 'task-1',
      version: '1.0.1',
      changelog: 'replace package',
      tags: ['tag-1'],
    })

    expect(mockPost).toHaveBeenCalledWith('/admin/skills/skill-1/reupload', {
      parse_task_id: 'task-1',
      version: '1.0.1',
      changelog: 'replace package',
      tags: ['tag-1'],
    })
    expect(result.skill_id).toBe('skill-1')
    expect(result.version).toBe('1.0.1')
  })
})

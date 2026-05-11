import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import api from '../api'

// 应用 Bot 模块按后端能力开关；探测结果本地缓存 10 分钟，
// 期间不再重复请求；过期或本地无记录时重新探测。
const APP_BOTS_TTL_MS = 10 * 60 * 1000

interface FeatureState {
  appBotsAvailable: boolean | null
  appBotsCheckedAt: number
  probeAppBots: (force?: boolean) => Promise<void>
  resetFeatures: () => void
}

function isFresh(checkedAt: number, ttl: number): boolean {
  return checkedAt > 0 && Date.now() - checkedAt < ttl
}

export const useFeatureStore = create<FeatureState>()(
  persist(
    (set, get) => ({
      appBotsAvailable: null,
      appBotsCheckedAt: 0,
      probeAppBots: async (force = false) => {
        const { appBotsAvailable, appBotsCheckedAt } = get()
        if (!force && appBotsAvailable !== null && isFresh(appBotsCheckedAt, APP_BOTS_TTL_MS)) {
          return
        }
        try {
          await api.get('/v1/app_bot/available')
          set({ appBotsAvailable: true, appBotsCheckedAt: Date.now() })
        } catch {
          // 404 → 路由未注册 → 隐藏；其它错误（网络/5xx）保守同样隐藏
          // 401 已被 axios 拦截器处理为登出，此处不应到达
          set({ appBotsAvailable: false, appBotsCheckedAt: Date.now() })
        }
      },
      resetFeatures: () => set({ appBotsAvailable: null, appBotsCheckedAt: 0 }),
    }),
    {
      name: 'dm-admin-features',
    },
  ),
)

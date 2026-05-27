import { useEffect, useState } from 'react'
import { Drawer, Tabs, Skeleton, message } from 'antd'
import { getSpace, type Space } from '../../api/space'
import { useSpaceScope } from '../../hooks/useSpaceScope'
import SpaceMembersPanel from './SpaceMembersPanel'
import SpaceInvitesPanel from './SpaceInvitesPanel'
import SpaceJoinAppliesPanel from './SpaceJoinAppliesPanel'
import SpaceInfoPanel from './SpaceInfoPanel'

type TabKey = 'members' | 'invites' | 'join-applies'

interface Props {
  spaceId: string | null
  open: boolean
  onClose: () => void
  defaultTab?: TabKey
  /** 字段保存后通知父组件刷新列表 */
  onUpdated?: () => void
}

export default function SpaceDetailDrawer({
  spaceId,
  open,
  onClose,
  defaultTab = 'members',
  onUpdated,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [space, setSpace] = useState<Space | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab)
  const scope = useSpaceScope()

  useEffect(() => {
    if (!open || !spaceId) {
      setSpace(null)
      return
    }
    setActiveTab(defaultTab)
    setLoading(true)
    getSpace(spaceId)
      .then(setSpace)
      .catch((error: Error) => message.error(error.message))
      .finally(() => setLoading(false))
  }, [open, spaceId, defaultTab])

  const readOnly = !!space && space.status !== 1

  return (
    <Drawer
      title={space ? `Space 详情 — ${space.name}` : 'Space 详情'}
      open={open}
      onClose={onClose}
      width={840}
      destroyOnClose
      className="admin-shell admin-drawer"
    >
      {loading || !space ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : (
        <>
          <SpaceInfoPanel
            space={space}
            onSpaceChange={setSpace}
            onUpdated={onUpdated}
          />

          <Tabs
            destroyInactiveTabPane
            activeKey={activeTab}
            onChange={(k) => setActiveTab(k as TabKey)}
            items={[
              {
                key: 'members',
                label: '成员',
                children: (
                  <SpaceMembersPanel
                    spaceId={space.space_id}
                    scope={scope}
                    readOnly={readOnly}
                  />
                ),
              },
              {
                key: 'invites',
                label: '邀请码',
                children: (
                  <SpaceInvitesPanel
                    spaceId={space.space_id}
                    scope={scope}
                    readOnly={readOnly}
                  />
                ),
              },
              {
                key: 'join-applies',
                label: '加入申请',
                children: (
                  <SpaceJoinAppliesPanel
                    spaceId={space.space_id}
                    scope={scope}
                    readOnly={readOnly}
                  />
                ),
              },
            ]}
          />
        </>
      )}
    </Drawer>
  )
}

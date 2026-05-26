import { useState, type ReactNode } from 'react'
import { Typography, Tooltip, message } from 'antd'
import InlineEditField from './InlineEditField'
import {
  updateSpaceProfile,
  type Space,
  type SpaceJoinMode,
  type SpaceStatus,
} from '../../api/space'

// 与服务端 modules/space/api_manager.go 中的字符上限保持一致。
const NAME_MAX = 100
const DESC_MAX = 500
const LOGO_MAX = 200

const STATUS_META: Record<SpaceStatus, { text: string; tone: 'online' | 'destroyed' | 'banned' }> = {
  0: { text: '已解散', tone: 'destroyed' },
  1: { text: '正常', tone: 'online' },
  2: { text: '已封禁', tone: 'banned' },
}

function runeCount(s: string): number {
  return Array.from(s).length
}

interface Props {
  space: Space
  onSpaceChange: (next: Space) => void
  onUpdated?: () => void
}

interface FieldProps {
  label: string
  children: ReactNode
  span?: 1 | 2
}

function Field({ label, children, span = 1 }: FieldProps) {
  return (
    <div className={`space-info-field${span === 2 ? ' span-2' : ''}`}>
      <div className="space-info-label">{label}</div>
      <div className="space-info-value">{children}</div>
    </div>
  )
}

export default function SpaceInfoPanel({ space, onSpaceChange, onUpdated }: Props) {
  const editable = space.status === 1
  const [logoBroken, setLogoBroken] = useState(false)

  const save = async <K extends keyof Space>(field: K, value: Space[K]) => {
    await updateSpaceProfile(space.space_id, {
      [field]: value,
    } as Parameters<typeof updateSpaceProfile>[1])
    onSpaceChange({ ...space, [field]: value })
    message.success('已保存')
    onUpdated?.()
  }

  const statusMeta = STATUS_META[space.status]

  return (
    <div className="space-info-card">
      <div className="space-info-header">
        <div className="space-info-header-main">
          <span className={`pill-dot ${statusMeta.tone}`}>{statusMeta.text}</span>
          <Typography.Text
            copyable={{ text: space.space_id }}
            className="mono space-info-id"
          >
            {space.space_id}
          </Typography.Text>
        </div>
      </div>

      <div className="space-info-grid">
        <Field label="Logo" span={2}>
          <div className="space-info-logo-row">
            {space.logo && !logoBroken ? (
              <img
                src={space.logo}
                alt=""
                className="space-info-logo-thumb"
                onError={() => setLogoBroken(true)}
              />
            ) : (
              <div className="space-info-logo-thumb space-info-logo-placeholder" aria-hidden>
                {space.name?.trim().charAt(0) || '?'}
              </div>
            )}
            <div className="space-info-logo-url">
              <InlineEditField
                kind="text"
                value={space.logo}
                readOnly={!editable}
                maxLength={LOGO_MAX}
                placeholder="https://..."
                emptyText="未设置"
                validate={(v) =>
                  runeCount(String(v)) > LOGO_MAX
                    ? `Logo 不能超过 ${LOGO_MAX} 个字符`
                    : null
                }
                onSave={(v) => {
                  setLogoBroken(false)
                  return save('logo', String(v))
                }}
              />
            </div>
          </div>
        </Field>

        <Field label="名称">
          <InlineEditField
            kind="text"
            value={space.name}
            readOnly={!editable}
            maxLength={NAME_MAX}
            placeholder="空间名称"
            validate={(v) => {
              const t = String(v).trim()
              if (!t) return '空间名称不能为空'
              if (runeCount(t) > NAME_MAX) return `空间名称不能超过 ${NAME_MAX} 个字符`
              return null
            }}
            onSave={(v) => save('name', String(v))}
          />
        </Field>

        <Field label="加入方式">
          <InlineEditField
            kind="select"
            value={space.join_mode}
            readOnly={!editable}
            display={
              space.join_mode === 0 ? (
                <span className="pill-outline neutral">直接加入</span>
              ) : (
                <span className="pill-outline warning">需审批</span>
              )
            }
            options={[
              { value: 0, label: '直接加入' },
              { value: 1, label: '需审批' },
            ]}
            onSave={(v) => save('join_mode', Number(v) as SpaceJoinMode)}
          />
        </Field>

        <Field label="创建者">
          <span className="space-info-creator">
            <span className="cell-primary">{space.creator_name}</span>
            {space.creator && (
              <Tooltip title={space.creator} mouseEnterDelay={0.2}>
                <span className="mono space-info-creator-id">
                  {space.creator.slice(0, 10)}…
                </span>
              </Tooltip>
            )}
          </span>
        </Field>

        <Field label="成员">
          <span className="space-info-members">
            <span className="cell-primary">{space.member_count}</span>
            <span className="space-info-members-sep">/</span>
            <InlineEditField
              kind="number"
              value={space.max_users}
              readOnly={!editable}
              min={0}
              display={
                space.max_users === 0 ? (
                  <span style={{ color: 'var(--a-text-tertiary)' }}>不限</span>
                ) : (
                  space.max_users
                )
              }
              validate={(v) => {
                const n = Number(v)
                if (n < 0) return '成员上限不能为负'
                if (n > 0 && n < space.member_count) {
                  return `成员上限 (${n}) 不能低于当前成员数 (${space.member_count})`
                }
                return null
              }}
              onSave={(v) => save('max_users', Number(v))}
            />
          </span>
        </Field>

        <Field label="创建时间">
          <span className="space-info-muted">{space.created_at}</span>
        </Field>

        <Field label="更新时间">
          <span className="space-info-muted">{space.updated_at}</span>
        </Field>

        <Field label="简介" span={2}>
          <InlineEditField
            kind="textarea"
            value={space.description}
            readOnly={!editable}
            maxLength={DESC_MAX}
            rows={3}
            emptyText="未填写"
            display={
              space.description ? (
                <span
                  style={{
                    color: 'var(--a-text-secondary)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {space.description}
                </span>
              ) : undefined
            }
            validate={(v) =>
              runeCount(String(v).trim()) > DESC_MAX
                ? `空间描述不能超过 ${DESC_MAX} 个字符`
                : null
            }
            onSave={(v) => save('description', String(v))}
          />
        </Field>
      </div>
    </div>
  )
}

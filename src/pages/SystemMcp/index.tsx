import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Divider,
  Form,
  Input,
  Modal,
  Select,
  Space as AntSpace,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  ApiOutlined,
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import type { ColumnsType } from 'antd/es/table'
import {
  createSystemMcp,
  listSystemMcps,
  type CreateMcpParams,
  type McpListItem,
  type McpTransport,
  type McpTool,
} from '../../api/mcp'
import { ApiError } from '../../api'
import { hasManagerCapability } from '../../auth/capabilities'
import { useAuthStore } from '../../store/auth'

const { Text } = Typography

const PAGE_SIZE = 20
const CATEGORY_KEYS = ['dev', 'data', 'search', 'productivity', 'ai', 'other']
const TRANSPORT_KEYS: McpTransport[] = ['streamable-http', 'sse', 'stdio']

/** Parse a comma-separated tag list into a trimmed, de-duped string array. */
function parseTags(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const chunk of raw.split(',')) {
    const t = chunk.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/** Parse a multi-line KEY=VALUE (or KEY: VALUE) list into a record. */
function parseKV(raw: string, separator: '=' | ':'): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf(separator)
    if (idx === -1) continue
    const k = trimmed.slice(0, idx).trim()
    const v = trimmed.slice(idx + 1).trim()
    if (k) out[k] = v
  }
  return out
}

/**
 * Admin page listing every visibility=system MCP across all Spaces (contract:
 * octo-marketplace/docs/api/mcp-v1.md §4.2 with visibility=system). The
 * "New" button opens a modal that submits to /admin/api/v1/mcps — the only
 * path where visibility=system is allowed.
 *
 * Distinct from the octo-web market page: no card view, no filter pills, no
 * infinite scroll. Ant Design table with server-side pagination fits the
 * admin console pattern (see pages/Spaces for the reference layout).
 */
export default function SystemMcp() {
  const { t } = useTranslation(['systemMcp', 'common'])
  const canWrite = useAuthStore((s) =>
    hasManagerCapability(s.managerCapabilities, 'mcp.write')
  )

  const [rows, setRows] = useState<McpListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const load = async (nextPage = page) => {
    setLoading(true)
    try {
      const resp = await listSystemMcps({
        limit: PAGE_SIZE,
        offset: (nextPage - 1) * PAGE_SIZE,
      })
      setRows(resp.items)
      setTotal(resp.total)
      setPage(nextPage)
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const columns = useMemo<ColumnsType<McpListItem>>(
    () => [
      {
        title: t('table.name'),
        dataIndex: 'name',
        key: 'name',
        render: (name: string, r) => (
          <AntSpace>
            <span style={{ fontSize: 18 }}>{r.icon || '🧩'}</span>
            <Text strong>{name}</Text>
          </AntSpace>
        ),
      },
      {
        title: t('table.category'),
        dataIndex: 'category',
        key: 'category',
        width: 140,
        render: (v: string) => (
          <Tag>{t(`categoryOptions.${v}`, { defaultValue: v })}</Tag>
        ),
      },
      {
        title: t('table.tools'),
        dataIndex: 'toolCount',
        key: 'toolCount',
        width: 90,
      },
      {
        title: t('table.creator'),
        dataIndex: 'creatorName',
        key: 'creatorName',
        width: 140,
        render: (v: string) => v || '—',
      },
    ],
    [t]
  )

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <Typography.Title level={4} style={{ marginBottom: 4 }}>
            <ApiOutlined style={{ marginRight: 8 }} />
            {t('pageTitle')}
          </Typography.Title>
          <Text type="secondary">{t('pageDesc')}</Text>
        </div>
        <AntSpace>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => load(page)}
            loading={loading}
          />
          {canWrite && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setCreateOpen(true)}
            >
              {t('create')}
            </Button>
          )}
        </AntSpace>
      </div>

      <Table<McpListItem>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        locale={{ emptyText: t('empty') }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: (p) => load(p),
        }}
      />

      <CreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => load(1)}
      />
    </div>
  )
}

// ─── Create modal ─────────────────────────────────────────────────────────

interface CreateModalProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

interface FormShape {
  name: string
  category: string
  slogan?: string
  icon?: string
  tagsRaw?: string
  transport: McpTransport
  url?: string
  authType?: 'none' | 'bearer'
  command?: string
  argsRaw?: string
  envRaw?: string
  headersRaw?: string
  tools: McpTool[]
}

function CreateModal({ open, onClose, onCreated }: CreateModalProps) {
  const { t } = useTranslation(['systemMcp', 'common'])
  const [form] = Form.useForm<FormShape>()
  const [submitting, setSubmitting] = useState(false)
  const transport = Form.useWatch('transport', form) ?? 'streamable-http'
  const isRemote = transport === 'streamable-http' || transport === 'sse'

  useEffect(() => {
    if (!open) {
      form.resetFields()
    }
  }, [open, form])

  const handleOk = async () => {
    let values: FormShape
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    const tools = (values.tools ?? []).filter((tt) => tt?.name?.trim())
    if (tools.length === 0) {
      message.warning(t('form.toolsHint'))
      return
    }
    const payload: CreateMcpParams = {
      name: values.name.trim(),
      category: values.category,
      slogan: values.slogan?.trim(),
      icon: values.icon?.trim(),
      tags: values.tagsRaw ? parseTags(values.tagsRaw) : undefined,
      transport: values.transport,
      url: isRemote ? values.url?.trim() : undefined,
      authType: isRemote ? values.authType ?? 'none' : undefined,
      command: !isRemote ? values.command?.trim() : undefined,
      args:
        !isRemote && values.argsRaw?.trim()
          ? values.argsRaw.trim().split(/\s+/)
          : undefined,
      env:
        !isRemote && values.envRaw ? parseKV(values.envRaw, '=') : undefined,
      headers:
        isRemote && values.headersRaw
          ? parseKV(values.headersRaw, ':')
          : undefined,
      tools,
    }
    setSubmitting(true)
    try {
      await createSystemMcp(payload)
      message.success(t('modal.success'))
      onCreated()
      onClose()
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : t('modal.failed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={t('modal.title')}
      onCancel={onClose}
      onOk={handleOk}
      okText={t('modal.submit')}
      cancelText={t('modal.cancel')}
      confirmLoading={submitting}
      destroyOnClose
      width={720}
    >
      <Form<FormShape>
        form={form}
        layout="vertical"
        initialValues={{
          category: 'dev',
          transport: 'streamable-http' as McpTransport,
          authType: 'none',
          tools: [{ name: '', description: '' }],
        }}
        preserve={false}
      >
        <Form.Item
          name="name"
          label={t('form.name')}
          rules={[{ required: true, message: t('form.nameRequired') }]}
        >
          <Input placeholder={t('form.namePlaceholder')} />
        </Form.Item>
        <Form.Item name="category" label={t('form.category')}>
          <Select
            options={CATEGORY_KEYS.map((k) => ({
              value: k,
              label: t(`categoryOptions.${k}`),
            }))}
          />
        </Form.Item>
        <Form.Item name="slogan" label={t('form.slogan')}>
          <Input placeholder={t('form.sloganPlaceholder')} />
        </Form.Item>
        <Form.Item name="icon" label={t('form.icon')}>
          <Input placeholder={t('form.iconPlaceholder')} />
        </Form.Item>
        <Form.Item name="tagsRaw" label={t('form.tags')}>
          <Input placeholder={t('form.tagsPlaceholder')} />
        </Form.Item>

        <Divider style={{ margin: '8px 0 16px' }} />

        <Form.Item name="transport" label={t('form.transport')}>
          <Select
            options={TRANSPORT_KEYS.map((k) => ({
              value: k,
              label: t(`transportOptions.${k}`),
            }))}
          />
        </Form.Item>
        {isRemote ? (
          <>
            <Form.Item name="url" label={t('form.url')}>
              <Input placeholder={t('form.urlPlaceholder')} />
            </Form.Item>
            <Form.Item name="authType" label={t('form.authType')}>
              <Select
                options={[
                  { value: 'none', label: t('form.authTypeNone') },
                  { value: 'bearer', label: t('form.authTypeBearer') },
                ]}
              />
            </Form.Item>
            <Form.Item name="headersRaw" label={t('form.headers')}>
              <Input.TextArea
                rows={3}
                placeholder={t('form.headersPlaceholder')}
              />
            </Form.Item>
          </>
        ) : (
          <>
            <Form.Item name="command" label={t('form.command')}>
              <Input placeholder={t('form.commandPlaceholder')} />
            </Form.Item>
            <Form.Item name="argsRaw" label={t('form.args')}>
              <Input placeholder={t('form.argsPlaceholder')} />
            </Form.Item>
            <Form.Item name="envRaw" label={t('form.env')}>
              <Input.TextArea rows={3} placeholder={t('form.envPlaceholder')} />
            </Form.Item>
          </>
        )}

        <Divider style={{ margin: '8px 0 16px' }} />

        <Form.Item label={t('form.tools')} required>
          <Form.List name="tools">
            {(fields, { add, remove }) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {fields.map((field) => (
                  <AntSpace key={field.key} align="baseline" style={{ display: 'flex' }}>
                    <Form.Item
                      {...field}
                      name={[field.name, 'name']}
                      style={{ flex: 1, marginBottom: 0 }}
                    >
                      <Input placeholder={t('form.toolNamePlaceholder')} />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'description']}
                      style={{ flex: 2, marginBottom: 0 }}
                    >
                      <Input placeholder={t('form.toolDescPlaceholder')} />
                    </Form.Item>
                    <Button
                      type="text"
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                    />
                  </AntSpace>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add({ name: '', description: '' })}
                  icon={<PlusOutlined />}
                >
                  {t('form.toolAdd')}
                </Button>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('form.toolsHint')}
                </Text>
              </div>
            )}
          </Form.List>
        </Form.Item>
      </Form>
    </Modal>
  )
}

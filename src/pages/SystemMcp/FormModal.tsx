/**
 * Create + edit form for a System MCP. Single-page antd Form with visually
 * distinct card-style sections (subtle bg + accent left border) so a ~15
 * field form still scans quickly. Two-column pairs use CSS Grid (avoids
 * antd's `Space.Compact` which strips inner Form.Item labels).
 */

import { useEffect, useMemo } from 'react'
import {
  Button,
  Form,
  Input,
  Modal,
  Select,
  message,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import {
  createSystemMcp,
  updateSystemMcp,
  type CreateMcpParams,
  type McpDetail,
  type McpFaq,
  type McpTool,
  type McpTransport,
} from '../../api/mcp'

const { TextArea } = Input

const CATEGORY_KEYS = ['dev', 'data', 'search', 'productivity', 'ai', 'other']
const TRANSPORT_OPTIONS: McpTransport[] = ['streamable-http', 'sse', 'stdio']

function isRemote(transport: McpTransport | undefined): boolean {
  return transport === 'streamable-http' || transport === 'sse'
}

interface FormValues {
  name: string
  category: string
  icon?: string
  tagsRaw?: string
  slogan?: string
  transport: McpTransport
  url?: string
  command?: string
  argsRaw?: string
  envRaw?: string
  headersRaw?: string
  authType: 'none' | 'bearer'
  tools: McpTool[]
  usageExamples: string[]
  faqs: McpFaq[]
  notes: string[]
}

const EMPTY: FormValues = {
  name: '',
  category: 'dev',
  icon: '',
  tagsRaw: '',
  slogan: '',
  transport: 'streamable-http',
  url: '',
  command: '',
  argsRaw: '',
  envRaw: '',
  headersRaw: '',
  authType: 'none',
  tools: [{ name: '', description: '' }],
  usageExamples: [],
  faqs: [],
  notes: [],
}

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

function parseKV(raw: string, sep: '=' | ':'): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf(sep)
    if (idx === -1) continue
    const k = trimmed.slice(0, idx).trim()
    const v = trimmed.slice(idx + 1).trim()
    if (k) out[k] = v
  }
  return out
}

function serializeKV(
  m: Record<string, string> | undefined,
  sep: '=' | ': '
): string {
  if (!m) return ''
  return Object.keys(m)
    .sort()
    .map((k) => `${k}${sep}${m[k] ?? ''}`)
    .join('\n')
}

function detailToValues(d: McpDetail): FormValues {
  const q = d.quickStart
  return {
    name: d.name,
    category: d.category || 'dev',
    icon: d.icon || '',
    tagsRaw: (d.tags || []).join(', '),
    slogan: d.slogan || '',
    transport: q.transport,
    url: q.url || '',
    command: q.command || '',
    argsRaw: (q.args || []).join(' '),
    envRaw: serializeKV(q.env, '='),
    headersRaw: serializeKV(q.headers, ': '),
    authType: (q.authType as 'none' | 'bearer' | undefined) || 'none',
    tools: d.tools?.length ? d.tools : [{ name: '', description: '' }],
    usageExamples: d.usageExamples?.length ? d.usageExamples : [],
    faqs: d.faqs?.length ? d.faqs : [],
    notes: d.notes?.length ? d.notes : [],
  }
}

interface Props {
  open: boolean
  editing: McpDetail | null
  onClose: () => void
  onSaved: (updated?: McpDetail) => void
}

export default function McpFormModal({ open, editing, onClose, onSaved }: Props) {
  const { t } = useTranslation(['systemMcp', 'common'])
  const [form] = Form.useForm<FormValues>()
  const isEdit = !!editing
  const transport = Form.useWatch('transport', form)
  const icon = Form.useWatch('icon', form)
  const remote = isRemote(transport)

  useEffect(() => {
    if (!open) return
    if (editing) form.setFieldsValue(detailToValues(editing))
    else form.setFieldsValue(EMPTY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing])

  const buildPayload = (values: FormValues): CreateMcpParams => {
    const isRemoteNow = isRemote(values.transport)
    const tools = (values.tools || []).filter((tt) => tt?.name?.trim())
    return {
      name: values.name.trim(),
      category: values.category,
      icon: values.icon?.trim() || undefined,
      tags: values.tagsRaw ? parseTags(values.tagsRaw) : undefined,
      slogan: values.slogan?.trim() || undefined,
      transport: values.transport,
      url: isRemoteNow ? values.url?.trim() || undefined : undefined,
      authType: isRemoteNow ? values.authType : undefined,
      command: !isRemoteNow ? values.command?.trim() || undefined : undefined,
      args: !isRemoteNow && values.argsRaw?.trim()
        ? values.argsRaw.trim().split(/\s+/)
        : undefined,
      env: !isRemoteNow && values.envRaw
        ? (() => {
            const kv = parseKV(values.envRaw, '=')
            return Object.keys(kv).length ? kv : undefined
          })()
        : undefined,
      headers: isRemoteNow && values.headersRaw
        ? (() => {
            const kv = parseKV(values.headersRaw, ':')
            return Object.keys(kv).length ? kv : undefined
          })()
        : undefined,
      tools,
      usageExamples: (values.usageExamples || []).filter((s) => s.trim()),
      faqs: (values.faqs || []).filter((f) => f.question.trim()),
      notes: (values.notes || []).filter((n) => n.trim()),
    }
  }

  const handleOk = async () => {
    let values: FormValues
    try {
      values = await form.validateFields()
    } catch {
      return
    }
    const payload = buildPayload(values)
    if (!payload.tools?.length) {
      message.warning(t('form.toolsHint'))
      return
    }
    try {
      if (isEdit && editing) {
        const updated = await updateSystemMcp(editing.id, payload)
        message.success(t('modal.updateSuccess'))
        onSaved(updated)
      } else {
        await createSystemMcp(payload)
        message.success(t('modal.createSuccess'))
        onSaved()
      }
      onClose()
    } catch (err) {
      const fallback = isEdit ? t('modal.updateFailed') : t('modal.createFailed')
      message.error(err instanceof ApiError ? err.message : fallback)
    }
  }

  const categoryOptions = useMemo(
    () =>
      CATEGORY_KEYS.map((k) => ({
        value: k,
        label: t(`categoryOptions.${k}`, { defaultValue: k }),
      })),
    [t]
  )
  const transportOptions = useMemo(
    () =>
      TRANSPORT_OPTIONS.map((tr) => ({
        value: tr,
        label: t(`transportOptions.${tr}`, { defaultValue: tr }),
      })),
    [t]
  )

  const iconIsImage = !!icon && (icon.startsWith('http') || icon.startsWith('data:'))

  return (
    <Modal
      title={isEdit ? t('modal.editTitle') : t('modal.createTitle')}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText={isEdit ? t('modal.save') : t('modal.submit')}
      cancelText={t('modal.cancel')}
      destroyOnClose
      width={720}
      styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={EMPTY}
        preserve={false}
        requiredMark="optional"
        className="mcp-form"
      >
        {/* Section 1 — Basics */}
        <FormSection
          title={t('form.sectionBasic')}
          desc={t('form.sectionBasicDesc')}
        >
          <div className="mcp-form-row mcp-form-row--icon">
            <div className="mcp-form-icon-preview" aria-hidden>
              {iconIsImage ? (
                <img src={icon} alt="" />
              ) : (
                <span>{icon || '🧩'}</span>
              )}
            </div>
            <div className="mcp-form-row__fields">
              <Form.Item
                name="name"
                label={t('form.name')}
                rules={[{ required: true, message: t('form.nameRequired') }]}
                style={{ marginBottom: 12 }}
              >
                <Input placeholder={t('form.namePlaceholder')} maxLength={80} />
              </Form.Item>
              <Form.Item
                name="icon"
                label={t('form.iconOrEmoji')}
                extra={t('form.iconHint')}
                style={{ marginBottom: 0 }}
              >
                <Input placeholder={t('form.iconPlaceholder')} />
              </Form.Item>
            </div>
          </div>

          <div className="mcp-form-grid mcp-form-grid--2">
            <Form.Item name="category" label={t('form.category')}>
              <Select options={categoryOptions} />
            </Form.Item>
            <Form.Item
              name="tagsRaw"
              label={t('form.tags')}
              extra={t('form.tagsHint')}
            >
              <Input placeholder={t('form.tagsPlaceholder')} />
            </Form.Item>
          </div>

          <Form.Item name="slogan" label={t('form.slogan')} style={{ marginBottom: 0 }}>
            <Input placeholder={t('form.sloganPlaceholder')} maxLength={120} />
          </Form.Item>
        </FormSection>

        {/* Section 2 — Connection */}
        <FormSection
          title={t('form.sectionConnect')}
          desc={t('form.sectionConnectDesc')}
        >
          <Form.Item name="transport" label={t('form.transport')}>
            <Select options={transportOptions} />
          </Form.Item>
          {remote ? (
            <>
              <Form.Item
                name="url"
                label={t('form.url')}
                rules={[
                  {
                    validator: (_, v) => {
                      if (!isRemote(form.getFieldValue('transport'))) return Promise.resolve()
                      return (v || '').trim()
                        ? Promise.resolve()
                        : Promise.reject(new Error(t('form.urlRequired')))
                    },
                  },
                ]}
              >
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
              <Form.Item
                name="headersRaw"
                label={t('form.headers')}
                extra={t('form.headersHint')}
                style={{ marginBottom: 0 }}
              >
                <TextArea rows={3} placeholder={t('form.headersPlaceholder')} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                name="command"
                label={t('form.command')}
                rules={[
                  {
                    validator: (_, v) => {
                      if (isRemote(form.getFieldValue('transport'))) return Promise.resolve()
                      return (v || '').trim()
                        ? Promise.resolve()
                        : Promise.reject(new Error(t('form.commandRequired')))
                    },
                  },
                ]}
              >
                <Input placeholder={t('form.commandPlaceholder')} />
              </Form.Item>
              <Form.Item name="argsRaw" label={t('form.args')} extra={t('form.argsHint')}>
                <Input placeholder={t('form.argsPlaceholder')} />
              </Form.Item>
              <Form.Item
                name="envRaw"
                label={t('form.env')}
                extra={t('form.envHint')}
                style={{ marginBottom: 0 }}
              >
                <TextArea rows={3} placeholder={t('form.envPlaceholder')} />
              </Form.Item>
            </>
          )}
        </FormSection>

        {/* Section 3 — Tools */}
        <FormSection
          title={t('form.sectionTools')}
          desc={t('form.sectionToolsDesc')}
        >
          <Form.List name="tools">
            {(fields, { add, remove }) => (
              <div className="mcp-form-list">
                {fields.map((field, idx) => (
                  <div className="mcp-form-tool" key={field.key}>
                    <div className="mcp-form-tool__grow">
                      <Form.Item
                        {...field}
                        name={[field.name, 'name']}
                        style={{ marginBottom: 8 }}
                      >
                        <Input placeholder={t('form.toolNamePlaceholder')} />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, 'description']}
                        style={{ marginBottom: 0 }}
                      >
                        <Input placeholder={t('form.toolDescPlaceholder')} />
                      </Form.Item>
                    </div>
                    <div className="mcp-form-tool__aside">
                      <span className="mcp-form-tool__idx">#{idx + 1}</span>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(field.name)}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  type="dashed"
                  icon={<PlusOutlined />}
                  onClick={() => add({ name: '', description: '' })}
                  block
                >
                  {t('form.toolAdd')}
                </Button>
              </div>
            )}
          </Form.List>
        </FormSection>

        {/* Section 4 — Docs */}
        <FormSection
          title={t('form.sectionDocs')}
          desc={t('form.sectionDocsDesc')}
          optional
        >
          <MiniListField
            label={t('detail.section.examples')}
            name="usageExamples"
            addLabel={t('form.exampleAdd')}
            placeholder={t('form.examplePlaceholder')}
          />

          <Form.Item label={t('detail.section.faqs')} style={{ marginBottom: 16 }}>
            <Form.List name="faqs">
              {(fields, { add, remove }) => (
                <div className="mcp-form-list">
                  {fields.map((field, idx) => (
                    <div className="mcp-form-faq" key={field.key}>
                      <div className="mcp-form-faq__head">
                        <span className="mcp-form-tool__idx">#{idx + 1}</span>
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => remove(field.name)}
                        />
                      </div>
                      <Form.Item
                        {...field}
                        name={[field.name, 'question']}
                        style={{ marginBottom: 8 }}
                      >
                        <Input placeholder={t('form.faqQuestionPlaceholder')} />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, 'answer']}
                        style={{ marginBottom: 0 }}
                      >
                        <TextArea rows={2} placeholder={t('form.faqAnswerPlaceholder')} />
                      </Form.Item>
                    </div>
                  ))}
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => add({ question: '', answer: '' })}
                    block
                  >
                    {t('form.faqAdd')}
                  </Button>
                </div>
              )}
            </Form.List>
          </Form.Item>

          <MiniListField
            label={t('detail.section.notes')}
            name="notes"
            addLabel={t('form.noteAdd')}
            placeholder={t('form.notePlaceholder')}
            marginBottomZero
          />
        </FormSection>
      </Form>
    </Modal>
  )
}

// ─── Presentation helpers ─────────────────────────────────────────────────

function FormSection({
  title,
  desc,
  optional,
  children,
}: {
  title: React.ReactNode
  desc?: React.ReactNode
  optional?: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation(['systemMcp'])
  return (
    <section className="mcp-form-section">
      <header className="mcp-form-section__head">
        <div className="mcp-form-section__title">
          {title}
          {optional && (
            <span className="mcp-form-section__optional">
              {t('form.optional')}
            </span>
          )}
        </div>
        {desc && <div className="mcp-form-section__desc">{desc}</div>}
      </header>
      <div className="mcp-form-section__body">{children}</div>
    </section>
  )
}

/** Reusable Form.List of plain-text rows (usageExamples / notes). */
function MiniListField({
  label,
  name,
  addLabel,
  placeholder,
  marginBottomZero,
}: {
  label: string
  name: 'usageExamples' | 'notes'
  addLabel: string
  placeholder: string
  marginBottomZero?: boolean
}) {
  return (
    <Form.Item label={label} style={{ marginBottom: marginBottomZero ? 0 : 16 }}>
      <Form.List name={name}>
        {(fields, { add, remove }) => (
          <div className="mcp-form-list">
            {fields.map((field, idx) => (
              <div className="mcp-form-mini-row" key={field.key}>
                <span className="mcp-form-tool__idx">#{idx + 1}</span>
                <Form.Item
                  {...field}
                  name={field.name}
                  style={{ flex: 1, marginBottom: 0 }}
                >
                  <Input placeholder={placeholder} />
                </Form.Item>
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => remove(field.name)}
                />
              </div>
            ))}
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => add('')}
              block
            >
              {addLabel}
            </Button>
          </div>
        )}
      </Form.List>
    </Form.Item>
  )
}

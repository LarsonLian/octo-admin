import { useState, useEffect, useRef } from 'react'
import { Modal, Steps, Upload, Button, Form, Input, Select, Space, message, Progress, Alert } from 'antd'
import { UploadOutlined, InboxOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  uploadInit,
  uploadToPresigned,
  triggerParse,
  getParseStatus,
  createSkill,
  updateSkill,
  uploadIcon,
  listCategories,
  type SkillDetail,
  type ParseTaskStatus,
  type CategoryItem,
} from '../../api/skill'

interface Props {
  open: boolean
  editSkill?: SkillDetail | null
  onClose: () => void
  onSuccess: () => void
}

type WizardStep = 0 | 1 | 2

export default function SkillFormModal({ open, editSkill, onClose, onSuccess }: Props) {
  const { t } = useTranslation('systemSkill')
  const [step, setStep] = useState<WizardStep>(0)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [parseStatus, setParseStatus] = useState<ParseTaskStatus | null>(null)
  const [uploadId, setUploadId] = useState('')
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [iconUrl, setIconUrl] = useState('')
  const [iconUploading, setIconUploading] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval>>()
  const [form] = Form.useForm()

  // Ensure polling stops on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  useEffect(() => {
    if (open) {
      listCategories().then(setCategories).catch(() => {})
      if (editSkill) {
        setStep(1)
        form.setFieldsValue({
          name: editSkill.name,
          display_name: editSkill.display_name,
          description: editSkill.description,
          category_id: editSkill.category_id,
          tags: editSkill.tags,
          visibility: editSkill.visibility,
        })
        setIconUrl(editSkill.icon_url || '')
      } else {
        setStep(0)
        form.resetFields()
        setIconUrl('')
      }
      setUploadId('')
      setParseStatus(null)
      setUploadProgress(0)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [open, editSkill, form])

  const handleFileUpload = async (file: File) => {
    setUploading(true)
    setUploadProgress(0)
    try {
      const { upload_id, presigned_url } = await uploadInit(file.name, file.size)
      setUploadId(upload_id)
      setUploadProgress(30)

      await uploadToPresigned(presigned_url, file)
      setUploadProgress(60)

      const { task_id } = await triggerParse(upload_id)
      setUploadProgress(70)

      // Poll parse status
      pollRef.current = setInterval(async () => {
        try {
          const status = await getParseStatus(task_id)
          setParseStatus(status)
          if (status.status === 'success') {
            clearInterval(pollRef.current!)
            setUploadProgress(100)
            setUploading(false)
            // Pre-fill form from parse results
            form.setFieldsValue({
              name: status.result_name,
              description: status.result_description,
              tags: status.result_tags || [],
            })
            setStep(1)
          } else if (status.status === 'failed') {
            clearInterval(pollRef.current!)
            setUploading(false)
          }
        } catch {
          clearInterval(pollRef.current!)
          setUploading(false)
        }
      }, 2000)
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
      setUploading(false)
    }
  }

  const handleIconUpload = async (file: File) => {
    setIconUploading(true)
    try {
      const { object_key } = await uploadIcon(file)
      setIconUrl(object_key)
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setIconUploading(false)
    }
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      if (editSkill) {
        await updateSkill(editSkill.id, {
          display_name: values.display_name,
          description: values.description,
          category_id: values.category_id,
          tags: values.tags,
          visibility: values.visibility,
          icon_url: iconUrl || undefined,
        })
        message.success(t('editModal.success'))
      } else {
        await createSkill({
          upload_id: uploadId,
          name: values.name,
          display_name: values.display_name || values.name,
          description: values.description,
          category_id: values.category_id,
          tags: values.tags || [],
          visibility: values.visibility || 'public',
          icon_url: iconUrl || undefined,
        })
        message.success(t('upload.success'))
      }
      onSuccess()
      onClose()
    } catch (err) {
      if (err instanceof Error) message.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const modalTitle = editSkill ? t('editModal.title') : t('upload.title')

  return (
    <Modal
      title={modalTitle}
      open={open}
      onCancel={onClose}
      footer={null}
      width={600}
      destroyOnClose
    >
      {!editSkill && (
        <Steps
          current={step}
          size="small"
          style={{ marginBottom: 24 }}
          items={[
            { title: t('upload.step1') },
            { title: t('upload.step2') },
          ]}
        />
      )}

      {/* Step 0: Upload file */}
      {step === 0 && (
        <div>
          <Upload.Dragger
            accept=".zip"
            showUploadList={false}
            beforeUpload={(file) => {
              handleFileUpload(file as File)
              return false
            }}
            disabled={uploading}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">{t('upload.selectFile')}</p>
            <p className="ant-upload-hint">{t('upload.selectFileHint')}</p>
          </Upload.Dragger>

          {uploading && (
            <div style={{ marginTop: 16 }}>
              <Progress percent={uploadProgress} status="active" />
              <div style={{ textAlign: 'center', marginTop: 8, color: '#999' }}>
                {uploadProgress < 60 ? t('upload.uploading') : t('upload.parsing')}
              </div>
            </div>
          )}

          {parseStatus?.status === 'failed' && (
            <Alert
              type="error"
              message={t('upload.parseFailed')}
              description={parseStatus.error_message}
              style={{ marginTop: 16 }}
            />
          )}
        </div>
      )}

      {/* Step 1: Confirm info */}
      {step === 1 && (
        <div>
          <Form form={form} layout="vertical" preserve={false}>
            <Form.Item name="name" label={t('upload.form.name')} rules={[{ required: true }]}>
              <Input disabled={!!editSkill} />
            </Form.Item>
            <Form.Item name="display_name" label={t('upload.form.displayName')}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label={t('upload.form.description')}>
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item name="category_id" label={t('upload.form.category')}>
              <Select
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
                allowClear
              />
            </Form.Item>
            <Form.Item name="tags" label={t('upload.form.tags')}>
              <Select
                mode="tags"
                placeholder={t('upload.form.tagsPlaceholder')}
                options={[]}
              />
            </Form.Item>
            <Form.Item name="visibility" label={t('upload.form.visibility')} initialValue="public">
              <Select
                options={[
                  { value: 'public', label: t('visibility.public') },
                  { value: 'space', label: t('visibility.space') },
                  { value: 'private', label: t('visibility.private') },
                ]}
              />
            </Form.Item>
            <Form.Item label={t('upload.form.icon')}>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={(file) => {
                  handleIconUpload(file as File)
                  return false
                }}
              >
                <Space>
                  {iconUrl && (
                    <img src={iconUrl} alt="icon" style={{ width: 32, height: 32, borderRadius: 4 }} />
                  )}
                  <Button icon={<UploadOutlined />} loading={iconUploading}>
                    {t('upload.form.uploadIcon')}
                  </Button>
                </Space>
              </Upload>
            </Form.Item>
          </Form>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            {!editSkill && (
              <Button onClick={() => setStep(0)}>{t('upload.prev')}</Button>
            )}
            <Button type="primary" loading={submitting} onClick={handleSubmit}>
              {t('upload.submit')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

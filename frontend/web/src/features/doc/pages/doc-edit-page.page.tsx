/** @route /docs/:docId/edit @title doc.title.edit @perm doc-edit @hide @activeMenu /doc/spaces */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, errorText } from '@zentao/api-client'
import type { DocView } from '@zentao/api-client/generated/model/docView'
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  PageContainer,
  PageHeader,
  PageLoading,
  Result,
  Space,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBeforeUnload, useBlocker, useNavigate, useParams } from 'react-router'
import { useMutationFeedback } from '../../../shared/use-mutation-feedback'
import { DOC_QUERY_ROOTS, fetchDocVersion, publishDocAction, qk, saveDocDraftAction } from '../api/doc.api'

/**
 * Markdown 编辑整页（T-5 / doc §6 F 范式）。
 * 数据源 GET /docs/{docId}/versions/0（v0 工作副本，仅可编辑者；只读者 40302 → 错误页）；
 * 发布 = 先存草稿把当前编辑内容落到 v0，再 publish（§4：publish 的快照源就是 v0）；无改动 → 42203 toast。
 */
export default function DocEditPage() {
  const message = useMessage()
  const feedback = useMutationFeedback()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const docId = Number(useParams().docId)
  const draft = useQuery({ queryKey: qk.doc.version(docId, 0), queryFn: () => fetchDocVersion(docId, 0) })
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [baseline, setBaseline] = useState<{ title: string; content: string } | null>(null)
  const initialized = useRef<number | null>(null)

  // 首次载入回填（后台 refetch 不覆盖正在编辑的内容）
  useEffect(() => {
    if (draft.data !== undefined && initialized.current !== docId) {
      initialized.current = docId
      const loaded = { title: draft.data.title, content: draft.data.content ?? '' }
      setTitle(loaded.title)
      setContent(loaded.content)
      setBaseline(loaded)
    }
  }, [draft.data, docId])

  const dirty = baseline !== null && (title !== baseline.title || content !== baseline.content)
  const blocker = useBlocker(dirty)
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (dirty) {
          event.preventDefault()
        }
      },
      [dirty],
    ),
  )

  const afterWrite = (saved: DocView): void => {
    setBaseline({ title: saved.title, content: saved.content ?? '' })
    for (const root of DOC_QUERY_ROOTS) {
      void queryClient.invalidateQueries({ queryKey: [root] })
    }
  }
  const saveDraft = useMutation({
    mutationFn: () => saveDocDraftAction(docId, { title, content }),
    onSuccess: (saved) => {
      message.success(t('doc.message.draftSaved'))
      afterWrite(saved)
    },
    onError: feedback.failed,
  })
  const publish = useMutation({
    mutationFn: async () => {
      await saveDocDraftAction(docId, { title, content })
      return publishDocAction(docId)
    },
    onSuccess: (saved) => {
      message.success(t('doc.message.published', { version: saved.version }))
      afterWrite(saved)
      navigate(`/docs/${docId}`)
    },
    onError: (error) => {
      // 42203 = v0 与当前版本无差异（§4 publish 守卫）
      if (error instanceof ApiError && error.code === 42203) {
        message.warning(t('doc.message.noChanges'))
        return
      }
      message.error(errorText(error, t))
    },
  })

  if (draft.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  // versions/0 对只读者/无权限者 40302（§7）；库不可见/不存在 40401
  if (draft.error) {
    return (
      <PageContainer>
        <PageHeader title={t('doc.title.edit')} backTo={`/docs/${docId}`} />
        <Result
          status="error"
          title={t('doc.message.editForbidden')}
          subTitle={errorText(draft.error, t, 'common.message.failed')}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            <Typography.Text strong>{t('doc.title.edit')}</Typography.Text>
            <Typography.Text type="secondary">
              {t('docVersion.field.workingCopy')}
              {draft.data.version === 0 ? '' : ` v${draft.data.version}`}
            </Typography.Text>
          </Space>
        }
        backTo={`/docs/${docId}`}
        extra={
          <>
            <Button loading={saveDraft.isPending} aria-label="doc-save-draft" onClick={() => saveDraft.mutate()}>
              {t('doc.action.save-draft')}
            </Button>
            <Button
              type="primary"
              loading={publish.isPending}
              aria-label="doc-publish"
              onClick={() => publish.mutate()}
            >
              {t('doc.action.publish')}
            </Button>
          </>
        }
      />
      <Card>
        <Form layout="vertical">
          <Form.Item label={t('doc.field.title')}>
            <Input
              value={title}
              maxLength={255}
              aria-label="doc-edit-title"
              onChange={(event) => setTitle(event.target.value)}
            />
          </Form.Item>
          <Form.Item label={t('doc.field.content')}>
            <Input.TextArea
              value={content}
              autoSize={{ minRows: 18, maxRows: 40 }}
              aria-label="doc-edit-content"
              placeholder={t('doc.message.markdownHint')}
              onChange={(event) => setContent(event.target.value)}
            />
          </Form.Item>
        </Form>
        {dirty ? <Typography.Text type="warning">{t('doc.message.unsaved')}</Typography.Text> : null}
      </Card>
      {blocker.state === 'blocked' ? (
        <Modal
          open
          title={t('doc.message.unsaved')}
          onCancel={() => blocker.reset()}
          onOk={() => blocker.proceed()}
          okText={t('doc.message.leave')}
          cancelText={t('common.action.cancel')}
        >
          <Typography.Paragraph>{t('doc.message.leaveHint')}</Typography.Paragraph>
        </Modal>
      ) : null}
    </PageContainer>
  )
}

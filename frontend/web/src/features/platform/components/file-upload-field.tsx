import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok } from '@zentao/api-client'
import { deleteFile, listFiles, uploadFile } from '@zentao/api-client/generated'
import { Button, List, Typography } from '@zentao/design-system'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

/** form-engine `type: file` 承载控件（platform 卡 §6）：选择文件即上传，展示已传文件并可删除。 */
export function FileUploadField({
  objectType,
  objectId,
  onChange,
}: {
  objectType?: string
  objectId?: number
  onChange?: (fileId: number | undefined) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const queryKey = ['listFiles', objectType ?? '', objectId ?? 0] as const
  const files = useQuery({
    queryKey,
    queryFn: async () => {
      if (!objectType || !objectId) {
        return { items: [], total: 0 }
      }
      return ok(
        await listFiles({
          'filters[objectType]': objectType,
          'filters[objectId]': String(objectId),
          page: 1,
          limit: 50,
        }),
      ).data
    },
  })

  const upload = useMutation({
    mutationFn: async (rawFile: File) => {
      // 规范化 File（jsdom 下 userEvent 注入的 File 缺内部 buffer，Request/FormData 序列化会崩；浏览器侧等价拷贝）
      const buffer = await rawFile.arrayBuffer()
      const file = new File([buffer], rawFile.name, { type: rawFile.type })
      return ok(
        await uploadFile({
          file,
          ...(objectType !== undefined ? { objectType } : {}),
          ...(objectId !== undefined ? { objectId } : {}),
        }),
      ).data
    },
    onSuccess: (view) => {
      void queryClient.invalidateQueries({ queryKey })
      onChange?.(view.id)
    },
  })
  const remove = useMutation({
    mutationFn: (fileId: number) => deleteFile(fileId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey }),
  })

  return (
    <div className="tw:flex tw:flex-col tw:gap-2">
      <input
        ref={inputRef}
        type="file"
        aria-label={t('platform.file.select')}
        className="tw:hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void upload.mutateAsync(file)
          }
          event.target.value = ''
        }}
      />
      <Button
        aria-label={t('platform.file.upload')}
        loading={upload.isPending}
        onClick={() => inputRef.current?.click()}
      >
        {t('platform.file.upload')}
      </Button>
      {(files.data?.items ?? []).length > 0 ? (
        <List
          size="small"
          dataSource={files.data?.items ?? []}
          renderItem={(file) => (
            <List.Item
              actions={[
                <Button key="remove" size="small" type="link" onClick={() => void remove.mutateAsync(file.id)}>
                  {t('common.action.delete')}
                </Button>,
              ]}
            >
              <Typography.Text>{file.title}</Typography.Text>
            </List.Item>
          )}
        />
      ) : null}
    </div>
  )
}

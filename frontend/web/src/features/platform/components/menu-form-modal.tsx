import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { MenuNode } from '@zentao/api-client/generated/model/menuNode'
import type { MenuRequest } from '@zentao/api-client/generated/model/menuRequest'
import {
  AutoComplete,
  Flex,
  Form,
  InputNumber,
  MENU_ICON_NAMES,
  MenuIcon,
  Modal,
  Radio,
  Select,
  Space,
  TreeSelect,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useEffect, useMemo } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { applyServerFields, errorProps, TextField } from '../../../shared/form-fields'
import { createMenuAction, fetchMenuPageRegistry, MENU_PAGE_REGISTRY_KEY, updateMenuAction } from '../api/platform.api'

/** 表单只认节点自身的字段（表格行把叶子的 children 去掉了，故不要求 children）。 */
type MenuNodeCore = Omit<MenuNode, 'children'>

/** 表单打开的目标：新建（可带上级：null = 一级模块）或编辑一个节点。 */
export type MenuFormTarget = { mode: 'create'; parent: MenuNodeCore | null } | { mode: 'edit'; node: MenuNodeCore }

export type MenuFormModalProps = {
  target: MenuFormTarget | null
  /** 当前菜单树（管理视图）：上级选择器与路径候选都从它来。 */
  groups: MenuNode[]
  open: boolean
  onClose: () => void
  /** 保存成功后回调：带上写回的节点（页面据此展开上级，新建的节点立刻可见）。 */
  onSaved: (node?: MenuNode) => void
}

type MenuType = 'dir' | 'menu' | 'button'

const menuFormShape = z.object({
  type: z.enum(['dir', 'menu', 'button']),
  parentKey: z.string().optional(),
  title: z.string().min(1, 'common.message.required'),
  component: z.string().optional(),
  path: z.string().optional(),
  icon: z.string().nullable().optional(),
  perm: z.string().nullable().optional(),
  orderNo: z.number().nullable().optional(),
  status: z.enum(['active', 'disabled']),
})

type MenuForm = z.input<typeof menuFormShape>

/**
 * 条件必填与旧 antd rules 逐条对齐（报错落点 = 字段）：
 * 新建（creating）时非一级模块必选上级、菜单必选页面实现；菜单恒必填路径；按钮恒必填权限标识。
 */
const menuFormSchema = (creating: boolean) =>
  menuFormShape.superRefine((values, ctx) => {
    const empty = (value: string | null | undefined): boolean => value === undefined || value === ''
    if (creating && values.type !== 'dir' && empty(values.parentKey)) {
      ctx.addIssue({ code: 'custom', path: ['parentKey'], message: 'common.message.required' })
    }
    if (creating && values.type === 'menu' && empty(values.component)) {
      ctx.addIssue({ code: 'custom', path: ['component'], message: 'common.message.required' })
    }
    if (values.type === 'menu' && empty(values.path)) {
      ctx.addIssue({ code: 'custom', path: ['path'], message: 'common.message.required' })
    }
    if (values.type === 'button' && empty(values.perm)) {
      ctx.addIssue({ code: 'custom', path: ['perm'], message: 'common.message.required' })
    }
  })

/** 节点渲染类型 → 表单类型（内置节点不可改类型：它的类型由页面注解/层级决定）。 */
function typeOf(kind: string): MenuType {
  if (kind === 'dir' || kind === 'group' || kind === 'section') {
    return 'dir'
  }
  return kind === 'button' ? 'button' : 'menu'
}

function initialValues(target: MenuFormTarget | null): MenuForm {
  if (target === null) {
    return { type: 'dir', title: '', status: 'active' }
  }
  if (target.mode === 'create') {
    const parent = target.parent
    return {
      // 一级模块的下级默认是菜单；分区下只能建菜单；菜单下只能建按钮
      type: parent === null ? 'dir' : parent.kind === 'item' ? 'button' : 'menu',
      ...(parent === null ? {} : { parentKey: parent.key }),
      title: '',
      status: 'active',
    }
  }
  const node = target.node
  return {
    type: typeOf(node.kind),
    ...(node.component === null || node.component === undefined ? {} : { component: node.component }),
    ...(node.parentKey === null ? {} : { parentKey: node.parentKey }),
    // 内置节点预填**原始 i18n 键**（不是当前语言的译文）：覆盖行继续跟着语言切换走，
    // 想写死文案的管理员直接把这里改成字面文本即可。
    title: node.title,
    ...(node.path === null ? {} : { path: node.path }),
    ...(node.icon === null ? {} : { icon: node.icon }),
    ...(node.perm === null ? {} : { perm: node.perm }),
    orderNo: node.orderNo,
    status: node.status as 'active' | 'disabled',
  }
}

/**
 * 菜单节点表单（T19 P2-1 / T21 / T03 纯 DB 化）。两条落库路径：
 * - 新建：POST /menus（type + parentKey；目录可以没有上级 = 一级模块；菜单项按页面注册表的 path 建）；
 * - 编辑：PATCH /menus?nodeKey=…（没有「覆盖行」这回事，改的就是那一行）。
 *
 * 「页面」下拉的数据源是页面注册表（GET /menus/page-registry，代码侧的 path → component 清单）：
 * 选中即回填该页面的路径，组件由服务端按 path 推导（页面实现是代码，不手选）。
 * 路径给候选、权限标识给提示，但不锁死输入——菜单链路的维护不该被选择器绑架。
 */
export function MenuFormModal({ target, groups, open, onClose, onSaved }: MenuFormModalProps) {
  const message = useMessage()
  const { t } = useTranslation()
  const editing = target?.mode === 'edit' ? target.node : null
  const { control, handleSubmit, setError, reset, setValue } = useForm<MenuForm>({
    resolver: zodResolver(menuFormSchema(editing === null)),
    defaultValues: initialValues(target),
  })
  const type = useWatch({ control, name: 'type' }) ?? 'dir'
  /** 页面注册表（T03）：新建菜单项从已注册页面里选一个，组件由服务端按 path 推导。 */
  const registry = useQuery({ queryKey: MENU_PAGE_REGISTRY_KEY, queryFn: fetchMenuPageRegistry, enabled: open })

  // 换目标/重开弹窗时显式落一遍初值（defaultValues 只在首挂载生效，
  // 否则上一次的标题/路径会留到下一次打开）。
  useEffect(() => {
    if (open) {
      reset(initialValues(target))
    }
  }, [open, target, reset])

  const save = useMutation({
    mutationFn: (values: MenuForm) => {
      // 空串 = 显式清空（后端把空串存成「无权限要求」/「没有图标」）；undefined 才是「不动这个字段」
      const perm = values.perm ?? ''
      const icon = values.icon ?? ''
      const orderNo = values.orderNo === null || values.orderNo === undefined ? {} : { orderNo: values.orderNo }
      if (editing !== null) {
        return updateMenuAction(editing.key, {
          title: values.title,
          path: values.path ?? '',
          icon,
          perm,
          status: values.status,
          ...orderNo,
        })
      }
      const request: MenuRequest = {
        type: values.type,
        title: values.title,
        icon,
        perm,
        status: values.status,
        ...orderNo,
      }
      if (values.parentKey !== undefined) {
        request.parentKey = values.parentKey
      }
      if (values.path !== undefined && values.path !== '') {
        request.path = values.path
      }
      return createMenuAction(request)
    },
    onSuccess: (saved) => {
      message.success(t('platform.menu.message.saved'))
      onSaved(saved)
      onClose()
    },
    // 类型/层级/权限码/key 不合法：后端只回 42201 + 字段码 → 字段级落点 + 统一提示（T70）
    onError: (error) => {
      applyServerFields(error, setError)
      message.error(errorText(error, t, 'platform.menu.message.invalid'))
    },
  })

  const submit = handleSubmit((values) => save.mutate(values))

  /** 上级候选：目录（挂目录/菜单）或菜单（挂按钮）——层级规则与后端一致，越级不会出现在下拉里。 */
  const parentTree = useMemo(() => {
    const allow = (node: MenuNode): boolean => (type === 'button' ? node.kind === 'item' : typeOf(node.kind) === 'dir')
    return toTreeData(groups, allow, t)
  }, [groups, type, t])

  /** 路径候选：树里已有的菜单项路径（把某个页面再挂一个入口时不必背路径）。 */
  const pathOptions = useMemo(() => collectPaths(groups).map((path) => ({ value: path, label: path })), [groups])

  const iconOptions = useMemo(() => MENU_ICON_NAMES.map((name) => ({ value: name, label: `${name}` })), [])

  return (
    <Modal
      open={open}
      forceRender
      title={
        target?.mode === 'create'
          ? target.parent === null
            ? t('platform.menu.action.create')
            : t('platform.menu.action.createChild')
          : t('platform.menu.action.edit')
      }
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <Controller
          control={control}
          name="type"
          render={({ field, fieldState }) => (
            <Form.Item
              label={t('platform.menu.field.kind')}
              extra={editing === null ? t('platform.menu.form.typeHint') : t('platform.menu.form.typeFixed')}
              {...errorProps(fieldState.error, t)}
            >
              <Radio.Group
                {...field}
                aria-label="menu-form-type"
                disabled={editing !== null}
                optionType="button"
                options={[
                  { value: 'dir', label: t('platform.menu.kind.dir') },
                  { value: 'menu', label: t('platform.menu.kind.item') },
                  { value: 'button', label: t('platform.menu.kind.button') },
                ]}
              />
            </Form.Item>
          )}
        />
        {editing === null ? (
          <Controller
            control={control}
            name="parentKey"
            render={({ field, fieldState }) => (
              <Form.Item
                label={t('platform.menu.field.parent')}
                extra={
                  type === 'button' ? t('platform.menu.form.buttonParentHint') : t('platform.menu.form.parentHint')
                }
                {...errorProps(fieldState.error, t)}
              >
                <TreeSelect
                  {...field}
                  value={field.value ?? null}
                  aria-label="menu-form-parent"
                  allowClear={type === 'dir'}
                  showSearch
                  treeNodeFilterProp="title"
                  placeholder={t('platform.menu.parent.placeholder')}
                  treeData={parentTree}
                />
              </Form.Item>
            )}
          />
        ) : null}
        <TextField
          control={control}
          name="title"
          label={t('platform.menu.field.title')}
          maxLength={120}
          extra={t('platform.menu.form.titleHint')}
          aria-label="menu-form-title"
        />
        {type === 'menu' ? (
          <Controller
            control={control}
            name="component"
            render={({ field, fieldState }) => (
              <Form.Item
                label={t('platform.menu.field.component')}
                extra={t('platform.menu.component.hint')}
                {...errorProps(fieldState.error, t)}
              >
                <Select
                  {...field}
                  value={field.value ?? null}
                  aria-label="menu-form-component"
                  showSearch
                  optionFilterProp="label"
                  disabled={editing !== null}
                  placeholder={t('platform.menu.component.placeholder')}
                  options={(registry.data?.items ?? []).map((page) => ({
                    value: page.component,
                    label: `${t(page.titleKey)}（${page.path}）`,
                  }))}
                  // 选页面即回填它的默认路径（路径仍可改：换入口地址不动组件——组件由 path 推导）
                  onChange={(value: string) => {
                    field.onChange(value)
                    const page = (registry.data?.items ?? []).find((item) => item.component === value)
                    if (page !== undefined) {
                      setValue('path', page.path)
                    }
                  }}
                />
              </Form.Item>
            )}
          />
        ) : null}
        {type === 'menu' ? (
          <Controller
            control={control}
            name="path"
            render={({ field, fieldState }) => (
              <Form.Item
                label={t('platform.menu.field.path')}
                extra={t('platform.menu.form.pathHint')}
                {...errorProps(fieldState.error, t)}
              >
                <AutoComplete
                  {...field}
                  value={field.value ?? ''}
                  aria-label="menu-form-path"
                  options={pathOptions}
                  filterOption={(input, option) => String(option?.value ?? '').includes(input)}
                  placeholder={t('platform.menu.path.placeholder')}
                />
              </Form.Item>
            )}
          />
        ) : null}
        {type === 'button' ? (
          <TextField
            control={control}
            name="perm"
            label={t('platform.menu.field.perm')}
            maxLength={64}
            placeholder="role-edit"
            extra={t('platform.menu.form.buttonPermHint')}
            aria-label="menu-form-perm"
          />
        ) : (
          <TextField
            control={control}
            name="perm"
            label={t('platform.menu.field.perm')}
            maxLength={64}
            placeholder="role-view"
            extra={t('platform.menu.form.permHint')}
            aria-label="menu-form-perm"
          />
        )}
        {type === 'button' ? null : (
          <Controller
            control={control}
            name="icon"
            render={({ field, fieldState }) => (
              <Form.Item
                label={t('platform.menu.field.icon')}
                extra={t('platform.menu.form.iconHint')}
                {...errorProps(fieldState.error, t)}
              >
                <Select
                  {...field}
                  value={field.value ?? null}
                  onChange={(value) => field.onChange(value ?? null)}
                  aria-label="menu-form-icon"
                  allowClear
                  showSearch
                  optionFilterProp="value"
                  options={iconOptions}
                  optionRender={(option) => (
                    <Space size={6}>
                      <MenuIcon name={String(option.value)} />
                      <span>{option.label}</span>
                    </Space>
                  )}
                />
              </Form.Item>
            )}
          />
        )}
        <Flex gap={12} wrap>
          <Controller
            control={control}
            name="orderNo"
            render={({ field, fieldState }) => (
              <Form.Item label={t('platform.menu.field.orderNo')} {...errorProps(fieldState.error, t)}>
                <InputNumber
                  {...(field.value === null || field.value === undefined ? {} : { value: field.value })}
                  aria-label="menu-form-order"
                  min={0}
                  max={9999}
                  style={{ width: 140 }}
                  onChange={(value) => field.onChange(value === null ? null : Number(value))}
                  onBlur={field.onBlur}
                />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="status"
            render={({ field, fieldState }) => (
              <Form.Item label={t('common.field.status')} {...errorProps(fieldState.error, t)}>
                <Select
                  {...field}
                  aria-label="menu-form-status"
                  style={{ width: 140 }}
                  options={[
                    { value: 'active', label: t('platform.menu.status.active') },
                    { value: 'disabled', label: t('platform.menu.status.disabled') },
                  ]}
                />
              </Form.Item>
            )}
          />
        </Flex>
        {save.error ? (
          <Typography.Paragraph type="danger">
            {errorText(save.error, t, 'platform.menu.message.invalid')}
          </Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}

/** 树的节点过滤 + 裁剪（保留命中节点的祖先），转成 TreeSelect 的 treeData（title 本地化）。 */
function toTreeData(
  nodes: MenuNode[],
  allow: (node: MenuNode) => boolean,
  t: (key: string) => string,
): { value: string; title: string; children: ReturnType<typeof toTreeData> }[] {
  const result: { value: string; title: string; children: ReturnType<typeof toTreeData> }[] = []
  for (const node of nodes) {
    const children = toTreeData(node.children, allow, t)
    if (allow(node) || children.length > 0) {
      result.push({ value: node.key, title: t(node.title), children })
    }
  }
  return result
}

function collectPaths(nodes: MenuNode[]): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.path !== null && node.path !== undefined) {
      paths.push(node.path)
    }
    paths.push(...collectPaths(node.children))
  }
  return paths
}

/**
 * IDE 设置页。
 *
 * 作为编辑器标签打开，配置写回宿主侧的 `settings.json`（跨会话共享）。
 * 分组 + 字段表驱动：新增设置项只需在 `SECTIONS` 里加一行，不必改渲染逻辑。
 */
import React, { useEffect, useState, useSyncExternalStore } from 'react'

import { cn } from '../../../common/cn'
import { openIdeContextMenu, textEditMenuItems } from '../../../common/context-menu'
import type { FeatureViewProps, IdeSettingsView } from '../../shell/contract'

/** 配色选项。 */
const THEME_OPTIONS = [
  { value: 'system', label: 'themeSystem' },
  { value: 'light', label: 'themeLight' },
  { value: 'dark', label: 'themeDark' },
] as const

/** 控件类型。 */
type FieldKind = 'number' | 'text' | 'bool' | 'theme'

/** 数字字段的取值范围。 */
interface NumberRange {
  /** 最小值，提交时低于它按它算。 */
  min: number
  /** 最大值，提交时高于它按它算。 */
  max: number
}

/** 单个设置项。 */
interface FieldConfig {
  /** 对应的设置键。 */
  key: keyof IdeSettingsView
  /** 控件类型。 */
  kind: FieldKind
  /** 标签文案 key。 */
  label: string
  /** 取值范围，仅数字字段。 */
  range?: NumberRange
  /** 数字字段的步进；缺省为 1。 */
  step?: number
}

/** 设置分组：标题 + 组内字段，顺序即页面顺序。 */
interface SectionConfig {
  /** 分组标题文案 key。 */
  label: string
  /** 组内字段。 */
  fields: FieldConfig[]
}

/** 设置页结构。 */
const SECTIONS: SectionConfig[] = [
  {
    label: 'sectionAppearance',
    fields: [{ key: 'theme', kind: 'theme', label: 'theme' }],
  },
  {
    label: 'sectionEditor',
    fields: [
      { key: 'fontSize', kind: 'number', label: 'fontSize', range: { min: 9, max: 32 } },
      { key: 'lineHeight', kind: 'number', label: 'lineHeight', range: { min: 1, max: 2.5 }, step: 0.1 },
      { key: 'tabSize', kind: 'number', label: 'tabSize', range: { min: 1, max: 8 } },
      { key: 'autoSave', kind: 'bool', label: 'autoSave' },
      { key: 'autoSaveDelayMs', kind: 'number', label: 'autoSaveDelay', range: { min: 500, max: 60000 } },
    ],
  },
  {
    label: 'sectionDiff',
    fields: [{ key: 'diffContext', kind: 'number', label: 'diffContext', range: { min: 0, max: 20 } }],
  },
  {
    label: 'sectionSearch',
    fields: [{ key: 'searchExclude', kind: 'text', label: 'searchExclude' }],
  },
  {
    label: 'sectionTools',
    fields: [
      { key: 'diagnoseCommand', kind: 'text', label: 'diagnoseCommand' },
      { key: 'terminalShell', kind: 'text', label: 'terminalShell' },
    ],
  },
]

/** 数字字段的输入框样式：与文本框保持同一高度与边框，视觉上成一行。 */
const INPUT_CLASS = 'h-7 rounded border border-line2 bg-base px-2 text-xs text-primary outline-none focus:border-line4'

/**
 * 一行设置：左侧标签，右侧控件，最右是取值范围提示。
 * @param props 标签、提示与控件
 * @returns 对齐的一行
 */
function FieldRow(props: { label: string; hint?: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex min-h-9 items-center gap-4 border-b border-line1/40 py-1.5 last:border-b-0">
      {/* 设置项名称（文案来自语言包） */}
      <label className="w-56 shrink-0 text-xs text-secondary">{props.label}</label>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {props.children}

        {/* 取值范围提示：紧跟控件，告诉用户可填区间，省掉一次盲试 */}
        {props.hint !== undefined && (
          <span className="shrink-0 text-[11px] text-secondary opacity-60">{props.hint}</span>
        )}
      </div>
    </div>
  )
}

/**
 * 数字输入。
 *
 * 输入过程只改本地草稿，失焦或回车才提交：设置一旦写入就会被宿主按范围 clamp，
 * 边输入边提交会把「清空重输」「正在输入小数」这类中间态覆盖掉，表现为输入没反应。
 * @param props 当前值、范围、步进与提交回调
 * @returns 数字输入框
 */
function NumberField(props: {
  value: number
  range: NumberRange
  step: number
  onChange(value: number): void
}): React.ReactElement {
  const { value, range, step, onChange } = props
  const [draft, setDraft] = useState(String(value))

  // 值被别处改动或提交后被 clamp 时同步草稿；输入过程中 value 不变，不会打断输入
  useEffect(() => setDraft(String(value)), [value])

  /** 校验草稿并提交；非法输入回到当前值。 */
  function commit(): void {
    const parsed = Number(draft)

    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(value))

      return
    }

    const next = Math.min(Math.max(parsed, range.min), range.max)
    setDraft(String(next))

    if (next !== value) onChange(next)
  }

  return (
    <input
      type="number"
      min={range.min}
      max={range.max}
      step={step}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        }
      }}
      className={cn(INPUT_CLASS, 'w-24')}
    />
  )
}

/**
 * 文本输入：同样失焦或回车才提交，避免每敲一个字符就写一次 settings.json。
 * @param props 当前值与提交回调
 * @returns 文本框
 */
function TextField(props: { value: string; onChange(value: string): void }): React.ReactElement {
  const { value, onChange } = props
  const [draft, setDraft] = useState(value)

  useEffect(() => setDraft(value), [value])

  /** 提交草稿；未变化时什么也不做。 */
  function commit(): void {
    if (draft !== value) onChange(draft)
  }

  return (
    <input
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        }
      }}
      className={cn(INPUT_CLASS, 'w-full max-w-md')}
    />
  )
}

/**
 * 渲染设置页。
 * @param props 见 FeatureViewProps
 * @returns 按分组字段表生成的表单
 */
export function SettingsPage({ t, services }: FeatureViewProps): React.ReactElement {
  // 必须订阅设置：不订阅时受控输入写回的值不会回流到界面，表现就是「输入无反应、刷新才变」
  const settings = useSyncExternalStore(
    (listener) => services.subscribeSettings(listener),
    () => services.settings(),
    () => services.settings(),
  )

  /**
   * 按字段类型渲染控件。
   * @param field 字段定义
   * @returns 对齐的一行
   */
  function renderField(field: FieldConfig): React.ReactElement {
    const hint = field.range === undefined ? undefined : `${String(field.range.min)} – ${String(field.range.max)}`

    if (field.kind === 'theme') {
      return (
        <FieldRow key={field.key} label={t(field.label)}>
          {/* 配色：跟随宿主时工作台完全继承宿主主题，强制项只覆盖工作台自己 */}
          <div className="flex items-center gap-0.5 rounded-md border border-line2 p-0.5">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => services.updateSettings({ theme: option.value })}
                className={cn(
                  'rounded px-2 py-0.5 text-xs transition-colors',
                  settings.theme === option.value ? 'bg-surface2 text-primary' : 'text-secondary hover:text-primary',
                )}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        </FieldRow>
      )
    }

    if (field.kind === 'bool') {
      return (
        <FieldRow key={field.key} label={t(field.label)}>
          <input
            type="checkbox"
            checked={settings.autoSave}
            onChange={(event) => services.updateSettings({ autoSave: event.target.checked })}
          />
        </FieldRow>
      )
    }

    if (field.kind === 'number') {
      return (
        <FieldRow key={field.key} label={t(field.label)} hint={hint}>
          <NumberField
            value={Number(settings[field.key])}
            range={field.range ?? { min: 0, max: Number.MAX_SAFE_INTEGER }}
            step={field.step ?? 1}
            onChange={(value) => services.updateSettings({ [field.key]: value })}
          />
        </FieldRow>
      )
    }

    return (
      <FieldRow key={field.key} label={t(field.label)}>
        <TextField
          value={String(settings[field.key])}
          onChange={(value) => services.updateSettings({ [field.key]: value })}
        />
      </FieldRow>
    )
  }

  return (
    <div
      className="h-full overflow-auto"
      // 设置页右键：接管浏览器菜单，给出标准文本编辑项
      onContextMenu={(event) =>
        openIdeContextMenu(
          event,
          services,
          textEditMenuItems({
            undo: t('menuUndo'),
            redo: t('menuRedo'),
            cut: t('menuCut'),
            copy: t('menuCopy'),
            paste: t('menuPaste'),
            selectAll: t('menuSelectAll'),
          }),
        )
      }
    >
      <div className="mx-auto w-full max-w-3xl px-8 py-6">
        {/* 设置页标题 */}
        <div className="text-[15px] font-medium text-primary">{t('title')}</div>

        {/* 设置页说明：改动立即生效并持久化 */}
        <div className="mt-1 text-xs text-secondary">{t('subtitle')}</div>

        {SECTIONS.map((section) => (
          <section key={section.label} className="mt-7">
            {/* 分组标题（文案来自语言包） */}
            <div className="mb-1 border-b border-line1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-secondary">
              {t(section.label)}
            </div>

            {section.fields.map(renderField)}
          </section>
        ))}
      </div>
    </div>
  )
}

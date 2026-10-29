/**
 * IDE 设置页。
 *
 * 作为编辑器标签打开，配置写回宿主侧的 `settings.json`（跨会话共享）。
 * 字段表驱动的表单：新增设置项只需在 `FIELDS` 里加一行，不必改渲染逻辑。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { FeatureViewProps, IdeSettingsView } from '../../shell/contract'

/** 配色选项。 */
const THEME_OPTIONS = [
  { value: 'system', label: 'themeSystem' },
  { value: 'light', label: 'themeLight' },
  { value: 'dark', label: 'themeDark' },
] as const

/** 设置字段。 */
interface FieldConfig {
  /** 对应的设置键。 */
  key: keyof IdeSettingsView
  /** 输入类型。 */
  type: 'number' | 'text'
  /** 标签文案 key。 */
  label: string
  /** 取值范围，仅数字字段。 */
  range?: { min: number; max: number }
}

/** 设置页字段表。 */
const FIELDS: FieldConfig[] = [
  { key: 'fontSize', type: 'number', label: 'fontSize', range: { min: 9, max: 32 } },
  { key: 'tabSize', type: 'number', label: 'tabSize', range: { min: 1, max: 8 } },
  { key: 'autoSaveDelayMs', type: 'number', label: 'autoSaveDelay', range: { min: 500, max: 60000 } },
  { key: 'diffContext', type: 'number', label: 'diffContext', range: { min: 0, max: 20 } },
  { key: 'searchExclude', type: 'text', label: 'searchExclude' },
  { key: 'diagnoseCommand', type: 'text', label: 'diagnoseCommand' },
  { key: 'terminalShell', type: 'text', label: 'terminalShell' },
]

/**
 * 渲染设置页。
 * @param props 见 FeatureViewProps
 * @returns 按字段表生成的表单
 */
export function SettingsPage({ t, services }: FeatureViewProps): React.ReactElement {
  const settings = services.settings()

  return (
    <div className="flex h-full items-start justify-center overflow-auto p-8">
      <div className="w-full max-w-xl">
        {/* 设置页标题 */}
        <div className="mb-1 text-base text-primary">{t('title')}</div>

        {/* 设置页说明：改动立即生效并持久化 */}
        <div className="mb-6 text-xs text-secondary">{t('subtitle')}</div>

        {/* 配色：跟随宿主时工作台完全继承宿主主题，强制项只覆盖工作台自己 */}
        <div className="mb-3 flex items-center gap-3">
          <label className="w-40 shrink-0 text-xs text-secondary">{t('theme')}</label>

          <div className="flex items-center gap-0.5 rounded-md border border-line2 p-0.5">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => services.updateSettings({ theme: option.value })}
                className={cn(
                  'rounded px-2 py-0.5 text-xs transition-colors',
                  settings.theme === option.value
                    ? 'bg-surface2 text-primary'
                    : 'text-secondary hover:text-primary',
                )}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        </div>

        {/* 自动保存开关单独一行：布尔值不适合走字段表的字符串输入 */}
        <div className="mb-3 flex items-center gap-3">
          {/* 自动保存开关名称 */}
          <label className="w-40 shrink-0 text-xs text-secondary">{t('autoSave')}</label>

          <input
            type="checkbox"
            checked={settings.autoSave}
            onChange={(event) => services.updateSettings({ autoSave: event.target.checked })}
          />
        </div>

        {FIELDS.map((field) => (
          <div key={field.key} className="mb-3 flex items-center gap-3">
            {/* 字段名称（文案来自语言包） */}
            <label className="w-40 shrink-0 text-xs text-secondary">{t(field.label)}</label>

            {field.type === 'number' ? (
              <input
                type="number"
                min={field.range?.min}
                max={field.range?.max}
                value={Number(settings[field.key])}
                onChange={(event) => {
                  const value = Number(event.target.value)
                  if (!Number.isFinite(value)) return

                  services.updateSettings({ [field.key]: value })
                }}
                className="w-32 rounded border border-line2 bg-base px-2 py-1 text-xs text-primary outline-none focus:border-line4"
              />
            ) : (
              <input
                value={String(settings[field.key])}
                onChange={(event) => services.updateSettings({ [field.key]: event.target.value })}
                className="min-w-0 flex-1 rounded border border-line2 bg-base px-2 py-1 text-xs text-primary outline-none focus:border-line4"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

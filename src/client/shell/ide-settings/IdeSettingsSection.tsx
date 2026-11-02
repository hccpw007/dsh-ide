/**
 * 设置页的 IDE 分区。
 *
 * 放三个只影响插件自身行为的偏好：是否显示对话页弹窗入口、同一工作空间是否
 * 共用一个 IDE、以及工作台界面语言。改动即时生效并写入 localStorage，不需要重启或刷新。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import { setPreference, useIdePreferences, type IdeLanguage } from '../ide-preferences'

/** 工作台语言选项；顺序即界面顺序，默认「跟随 DSH」。 */
const LANGUAGE_OPTIONS: ReadonlyArray<{ value: IdeLanguage; label: string }> = [
  { value: 'system', label: 'settings.ideLanguageSystem' },
  { value: 'zh', label: 'settings.ideLanguageZh' },
  { value: 'en', label: 'settings.ideLanguageEn' },
]

/** 分区 props。 */
export interface IdeSettingsSectionProps {
  /** 外壳翻译函数。 */
  t: Translate
}

/** 开关 props。 */
interface ToggleProps {
  /** 是否打开。 */
  checked: boolean
  /** 无障碍名称。 */
  label: string
  /** 切换回调。 */
  onChange(next: boolean): void
}

/**
 * 胶囊开关。
 *
 * 与宿主「All In One」设置页的开关保持同一套视觉：轨道用品牌色，关闭态用边框色，
 * 滑块为底色加阴影，两端必须是完整的半圆。形状不能只靠 `rounded-full`——宿主在
 * `:root` 上把圆角设成了超椭圆，小尺寸轨道会被画成"方"角，因此改用 `ide-switch`
 * 类由样式表强制药丸形并恢复默认圆角形状。
 * @param props 见 ToggleProps
 * @returns 开关按钮
 */
function Toggle({ checked, label, onChange }: ToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'flex h-5 w-9 shrink-0 items-center ide-switch border-0 p-0 transition',
        checked ? 'bg-brand' : 'bg-line2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
      )}
    >
      {/* 滑块：打开时右移 18px，正好在 36px 宽的轨道内留出两端的 2px 间隙 */}
      <span
        aria-hidden="true"
        className={cn(
          'h-4 w-4 ide-switch bg-base shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

/**
 * 渲染 IDE 设置分区。
 * @param props 见 IdeSettingsSectionProps
 * @returns 两个偏好开关
 */
export function IdeSettingsSection({ t }: IdeSettingsSectionProps): React.ReactElement {
  const preferences = useIdePreferences()

  return (
    <div className="dsh-ide-settings flex flex-col gap-1 px-1 py-2">
      {/* 分区标题 */}
      <h2 className="pb-2 text-base font-semibold text-primary">{t('settings.title')}</h2>

      {/* 是否显示对话页的 IDE 弹窗入口 */}
      <div className="flex items-start justify-between gap-6 border-b border-line1 py-4">
        <div className="min-w-0">
          <div className="text-[13px] text-primary">{t('settings.popupButton')}</div>
          <div className="mt-1 text-xs text-secondary">{t('settings.popupButtonHint')}</div>
        </div>

        <Toggle
          checked={preferences.popupButtonVisible}
          label={t('settings.popupButton')}
          onChange={(next) => setPreference('popupButtonVisible', next)}
        />
      </div>

      {/* 同一工作空间是否共用同一个 IDE */}
      <div className="flex items-start justify-between gap-6 border-b border-line1 py-4">
        <div className="min-w-0">
          <div className="text-[13px] text-primary">{t('settings.sharedWorkspace')}</div>
          <div className="mt-1 text-xs text-secondary">{t('settings.sharedWorkspaceHint')}</div>
        </div>
        <Toggle
          checked={preferences.sharedWorkspace}
          label={t('settings.sharedWorkspace')}
          onChange={(next) => setPreference('sharedWorkspace', next)}
        />
      </div>

      {/* 工作台界面语言：只影响 IDE 工作台，本设置页与宿主其余界面仍跟随 DSH */}
      <div className="flex items-start justify-between gap-6 border-b border-line1 py-4">
        <div className="min-w-0">
          <div className="text-[13px] text-primary">{t('settings.ideLanguage')}</div>
          <div className="mt-1 text-xs text-secondary">{t('settings.ideLanguageHint')}</div>
        </div>

        {/*
          语言三选一：跟随 DSH / 中文 / English。
          外观对齐宿主设置页的控件：36px 高、12px 圆角、14px 字、无边框，
          未选中为浅色底，选中用宿主的主强调色（黑底白字），不再自绘细边框按钮组。
        */}
        <div
          role="group"
          aria-label={t('settings.ideLanguage')}
          className="flex shrink-0 items-center gap-2"
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={preferences.language === option.value}
              // 切换后工作台立即按新语言重渲染，设置项自身文案不随之改变
              onClick={() => setPreference('language', option.value)}
              className={cn(
                'h-9 rounded-xl border-0 px-3.5 text-sm transition-colors',
                preferences.language === option.value
                  ? 'bg-primary text-inverted'
                  : 'bg-surface1 text-secondary hover:bg-surface2 hover:text-primary',
              )}
            >
              {/* 语言选项文案（跟随 DSH / 中文 / English） */}
              {t(option.label)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

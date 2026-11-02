/**
 * 设置页的 IDE 分区。
 *
 * 只放两个影响插件自身行为的开关：是否显示对话页弹窗入口、同一工作空间是否
 * 共用一个 IDE。改动即时生效并写入 localStorage，不需要重启或刷新。
 */
import React from 'react'

import { cn } from '../../../common/cn'
import type { Translate } from '../../../types/plugin'

import { setPreference, useIdePreferences } from '../ide-preferences'

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
    </div>
  )
}

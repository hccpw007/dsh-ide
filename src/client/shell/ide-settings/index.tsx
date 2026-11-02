/**
 * 设置页 IDE 分区的注册。
 *
 * 宿主设置页的左侧导航由 `settings.section` 提供，注册即多一个独立菜单项，
 * 不需要改动宿主设置页本身。
 */
import React from 'react'

import type { PluginContext, Translate } from '../../../types/plugin'

import { IdeSettingsSection } from './IdeSettingsSection'

/** 分区 id，同时是导航项的 key。 */
const SECTION_ID = 'ide'

/**
 * 注册 IDE 设置分区。
 * @param ctx 插件上下文
 * @param t 外壳翻译函数
 */
export function registerIdeSettings(ctx: PluginContext, t: Translate): void {
  // order 40：排在宿主通用设置、模型、插件等分区之后，位置与「插件市场」相邻
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      { name: 'settings.section', id: SECTION_ID, order: 40, label: () => t('settings.nav') },
      () => <IdeSettingsSection t={t} />,
    ),
  )
}

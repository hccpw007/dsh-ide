/**
 * 顶部工具栏的分组分隔线。
 */
import React from 'react'

/**
 * 渲染一根细竖线，用来隔开工具栏里不同功能分组。
 * @returns 1px 竖线
 */
export function ToolbarDivider(): React.ReactElement {
  return <span aria-hidden="true" className="mx-1 h-4 w-px bg-line1" />
}

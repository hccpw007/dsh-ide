/**
 * 工作台文案的翻译入口。
 *
 * IDE 工作台可以独立于宿主选择界面语言（设置页里的「语言」），因此不能直接用
 * 宿主绑定的翻译函数。这里按偏好语言查插件自己的字典，缺 key 时回退宿主翻译，
 * 保证新增文案漏翻时界面上不露出语言 key。
 *
 * 字典由插件入口注入：shell 不反向依赖 `client/index`，入口在 apply 时把合并后的
 * 字典交进来即可。
 */
import { useCallback } from 'react'

import type { LocaleDictionaries } from '../../common/locale'
import type { Translate } from '../../types/plugin'

import { useIdePreferences } from './ide-preferences'

/** 工作台可用的全部语言字典；入口注册语言包时注入。 */
let dictionaries: LocaleDictionaries = {}

/**
 * 注入工作台字典。
 * @param next 合并后的多语言字典
 */
export function setWorkbenchDictionaries(next: LocaleDictionaries): void {
  dictionaries = next
}

/**
 * 取当前 IDE 语言的翻译函数。
 *
 * 选择「跟随 DSH」时直接用宿主翻译函数；强制中文/英文时优先查对应字典，
 * 字典缺该 key 再回退宿主文案。偏好变化后订阅方重渲染即拿到新语言的文案。
 * @param base 宿主绑定的翻译函数
 * @returns 工作台可用的翻译函数
 */
export function useWorkbenchTranslate(base: Translate): Translate {
  const language = useIdePreferences().language

  return useCallback(
    (key: string): string => {
      if (language === 'system') return base(key)

      return dictionaries[language]?.[key] ?? base(key)
    },
    [base, language],
  )
}

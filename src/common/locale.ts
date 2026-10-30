/**
 * 语言字典的合并工具。
 *
 * 外壳与每个 feature 各自维护语言字典：feature 的 key 统一加 `<id>.` 前缀，
 * 这样不同功能出现同名 key（如 title）时不会互相覆盖，新增功能也无需改动外壳字典。
 */

/** 按语言分组的字典：外层 key 是语言代码，内层是文案 key 与文案。 */
export type LocaleDictionaries = Record<string, Record<string, string>>

/**
 * 给一份字典的全部 key 加上 `<featureId>.` 前缀。
 * @param featureId 功能 id，作为命名空间前缀
 * @param locales 该功能的语言字典
 * @returns key 已带前缀的新字典
 */
function prefixFeatureLocales(
  featureId: string,
  locales: LocaleDictionaries,
): LocaleDictionaries {
  const result: LocaleDictionaries = {}

  // 逐语言逐条加前缀，避免修改调用方传入的原对象
  for (const [locale, dictionary] of Object.entries(locales)) {
    const prefixed: Record<string, string> = {}

    for (const [key, value] of Object.entries(dictionary)) {
      prefixed[`${featureId}.${key}`] = value
    }

    result[locale] = prefixed
  }

  return result
}

/**
 * 按顺序合并多份字典，同一语言下的同名 key 由后传入者覆盖。
 * @param sources 待合并的字典
 * @returns 合并后的新字典
 */
export function mergeDictionaries(...sources: LocaleDictionaries[]): LocaleDictionaries {
  const result: LocaleDictionaries = {}

  for (const source of sources) {
    for (const [locale, dictionary] of Object.entries(source)) {
      result[locale] = { ...result[locale], ...dictionary }
    }
  }

  return result
}

/**
 * 汇总全部 feature 的语言字典，key 自动带上各自的 id 前缀。
 * 只依赖 id 与 locales 两个字段，不反向依赖 shell 的 feature 类型。
 * @param features 已通过校验的功能列表
 * @returns 可直接与外壳字典合并的字典
 */
export function collectFeatureLocales(
  features: ReadonlyArray<{ id: string; locales: LocaleDictionaries }>,
): LocaleDictionaries {
  return mergeDictionaries(
    ...features.map((feature) => prefixFeatureLocales(feature.id, feature.locales)),
  )
}

/**
 * 把每个语言槽都填成英文文案。
 *
 * 产品要求本插件界面固定英文。宿主可能以中文启动，若只注册英文，按中文查找
 * 会失败并露出语言 key，因此保留宿主已声明的语言槽，但内容统一指向英文。
 * @param dictionaries 合并后的多语言字典
 * @returns 所有语言都指向英文的新字典
 */
export function englishOnly(dictionaries: LocaleDictionaries): LocaleDictionaries {
  const english = dictionaries.en ?? Object.values(dictionaries)[0] ?? {}
  const result: LocaleDictionaries = {}

  for (const locale of Object.keys(dictionaries)) result[locale] = english

  return result
}

/**
 * 给翻译函数绑定 feature 前缀。
 *
 * 外壳工具条渲染 feature 的弹窗时要交出与 feature 内部一致的翻译函数：feature
 * 组件里写的都是短 key，前缀由这里统一补上，弹窗因此不必知道自己的命名空间。
 * @param t 外壳翻译函数
 * @param featureId 功能 id，作为命名空间前缀
 * @returns 只接受短 key 的翻译函数
 */
export function featureTranslate(t: (key: string) => string, featureId: string): (key: string) => string {
  return (key: string) => t(`${featureId}.${key}`)
}

/**
 * 资源模块的类型声明。
 *
 * 构建脚本用 `loader: { '.css': 'text', '.svg': 'text' }` 把样式与图标当作字符串
 * 打进产物，TypeScript 默认不认识这种导入，这里补上声明。
 */
declare module '*.css' {
  const text: string
  export default text
}

declare module '*.svg' {
  const text: string
  export default text
}

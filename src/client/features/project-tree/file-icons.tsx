/**
 * 项目树文件图标。
 *
 * 图标资源在 file-icon-assets.ts，这里只负责「文件名 → 图标」的映射与渲染。
 * 与文件夹图标不同，文件图标按 IDEA 的做法取官方彩色图标，因此不能统一用
 * currentColor；颜色已换成 CSS 变量，随明暗主题自动切换。
 */
import React from 'react'

import { FILE_ICON_SVG } from './file-icon-assets'

/** 扩展名 → 图标 key；同一种图标可被多个扩展名复用。 */
const EXTENSION_ICONS: Readonly<Record<string, string>> = {
  java: 'java',
  // .class 是字节码，IDEA 用独立的 C/1 角标，不要和 .java 源码混淆
  class: 'javaClass',
  kt: 'kotlin',
  kts: 'kotlin',
  js: 'javaScript',
  mjs: 'javaScript',
  cjs: 'javaScript',
  jsx: 'jsx',
  ts: 'typeScript',
  mts: 'typeScript',
  cts: 'typeScript',
  tsx: 'tsx',
  json: 'json',
  json5: 'json',
  jsonc: 'json',
  html: 'html',
  htm: 'html',
  xhtml: 'xhtml',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  vue: 'vue',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  txt: 'text',
  log: 'text',
  xml: 'xml',
  xsl: 'xml',
  xslt: 'xml',
  dtd: 'xml',
  xsd: 'xsd',
  wsdl: 'wsdl',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  ini: 'config',
  conf: 'config',
  cfg: 'config',
  env: 'config',
  properties: 'properties',
  gradle: 'gradle',
  groovy: 'groovy',
  gvy: 'groovy',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ksh: 'shell',
  bat: 'shell',
  cmd: 'shell',
  ps1: 'shell',
  c: 'c',
  h: 'h',
  hpp: 'cpp',
  hxx: 'cpp',
  hh: 'cpp',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  cs: 'csharp',
  swift: 'swift',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  bmp: 'image',
  webp: 'image',
  ico: 'image',
  tif: 'image',
  tiff: 'image',
  psd: 'image',
  svg: 'image',
  zip: 'archive',
  jar: 'archive',
  war: 'archive',
  ear: 'archive',
  tar: 'archive',
  gz: 'archive',
  tgz: 'archive',
  bz2: 'archive',
  xz: 'archive',
  '7z': 'archive',
  rar: 'archive',
  csv: 'csv',
  tsv: 'csv',
  patch: 'patch',
  diff: 'patch',
  http: 'http',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'idl',
  tf: 'terraform',
  tfvars: 'terraform',
  hcl: 'terraform',
  rst: 'rst',
  jsp: 'jsp',
  jspx: 'jspx',
  ipynb: 'jupyter',
  dockerfile: 'docker',
  // MANIFEST.MF：Java 清单文件，IDEA 用带封印的清单图标
  mf: 'manifest',
  ttf: 'font',
  otf: 'font',
  woff: 'font',
  woff2: 'font',
  eot: 'font',
  bin: 'binaryData',
  exe: 'binaryData',
  dll: 'binaryData',
  so: 'binaryData',
  dylib: 'binaryData',
  o: 'binaryData',
  obj: 'binaryData',
}

/** 完整文件名 → 图标 key；优先于扩展名，用于没有扩展名或扩展名会误判的文件。 */
const NAME_ICONS: Readonly<Record<string, string>> = {
  '.gitignore': 'gitignore',
  '.editorconfig': 'editorConfig',
  dockerfile: 'docker',
  'pom.xml': 'maven',
  'package.json': 'npm',
  'package-lock.json': 'npm',
  'npm-shrinkwrap.json': 'npm',
}

/** 未识别类型使用的图标，与 IDEA 的纯文本文件图标一致。 */
const FALLBACK_ICON = 'text'

/**
 * 取出文件名对应的图标 key。
 * @param name 文件名
 * @returns 图标 key；一定有值（未识别时回退到文本图标）
 */
function iconKeyOf(name: string): string {
  const byName = NAME_ICONS[name.toLowerCase()]
  if (byName !== undefined) return byName

  const dot = name.lastIndexOf('.')

  // 点开头的文件（.gitignore）整体算隐藏文件，最后一段不是类型扩展名
  if (dot <= 0 || dot === name.length - 1) return FALLBACK_ICON

  return EXTENSION_ICONS[name.slice(dot + 1).toLowerCase()] ?? FALLBACK_ICON
}

/**
 * 渲染文件名前的图标。
 * @param name 文件名
 * @returns 16px 的官方图标；未识别类型回退到文本图标
 */
export function fileIcon(name: string): React.ReactNode {
  const svg = FILE_ICON_SVG[iconKeyOf(name)] ?? FILE_ICON_SVG[FALLBACK_ICON]

  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center"
      aria-hidden="true"
      // 图标是构建期常量，不是用户内容；用 innerHTML 渲染可以省掉 50 个图标组件
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

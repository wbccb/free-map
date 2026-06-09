import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = process.cwd()
const distDir = path.join(projectRoot, 'dist')
const outputDir = path.join(projectRoot, 'dist-local')
const outputFile = path.join(outputDir, 'free-map.html')
const readmeFile = path.join(outputDir, 'README.txt')

function resolveDistAsset(assetPath) {
  const normalizedPath = assetPath.replace(/^\.?\//, '')
  return path.join(distDir, normalizedPath)
}

function escapeInlineScript(content) {
  return content.replaceAll('</script', '<\\/script')
}

function escapeInlineStyle(content) {
  return content.replaceAll('</style', '<\\/style')
}

let html = await readFile(path.join(distDir, 'index.html'), 'utf8')

html = await replaceAsync(
  html,
  /<link\s+rel="stylesheet"\s+crossorigin\s+href="([^"]+)"\s*\/?>/g,
  async (_match, href) => {
    const css = await readFile(resolveDistAsset(href), 'utf8')
    return `<style>${escapeInlineStyle(css)}</style>`
  },
)

html = await replaceAsync(
  html,
  /<script\s+type="module"\s+crossorigin\s+src="([^"]+)"><\/script>/g,
  async (_match, src) => {
    const js = await readFile(resolveDistAsset(src), 'utf8')
    return `<script type="module">${escapeInlineScript(js)}</script>`
  },
)

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })
await writeFile(outputFile, html, 'utf8')
await writeFile(
  readmeFile,
  [
    'Free Map local build',
    '',
    'How to use on macOS:',
    '1. Unzip free-map-mac.zip.',
    '2. Open dist-local/free-map.html with Chrome or Safari.',
    '3. Use the same browser and keep the file in the same folder if you want automatic localStorage restore to keep working.',
    '4. Before sending the file to another person, or before moving/renaming it, click "保存 JSON" in the app to export a backup.',
    '5. If the page says local auto-save is unavailable, use "保存 JSON" and "导入 JSON" for data persistence.',
    '',
  ].join('\n'),
  'utf8',
)

console.info(`Local browser build written to ${path.relative(projectRoot, outputFile)}`)

async function replaceAsync(value, regex, replacer) {
  const matches = [...value.matchAll(regex)]
  let result = value

  for (const match of matches.reverse()) {
    const replacement = await replacer(...match)
    result = `${result.slice(0, match.index)}${replacement}${result.slice(match.index + match[0].length)}`
  }

  return result
}

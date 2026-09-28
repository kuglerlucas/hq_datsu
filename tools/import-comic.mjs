import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'

function fail(message) {
  throw new Error(message)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} está ausente.`)
  return value.trim()
}

function safeAssetPath(value, comicId, label) {
  const path = requiredText(value, label)
  const parts = path.split('/')
  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes(':') ||
    parts.some((part) => part === '' || part === '.' || part === '..') ||
    !path.startsWith(`content/comics/${comicId}/`)
  ) {
    fail(`${label} não está dentro da pasta desta HQ.`)
  }
  return path
}

function validateManifest(value, archiveFiles) {
  if (!isRecord(value)) fail('O manifesto do pacote está inválido.')

  const id = requiredText(value.id, 'ID da HQ')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) fail('O ID da HQ não é um slug válido.')
  const title = requiredText(value.title, 'Título')
  const pageCount = Number(value.pageCount)
  if (!Number.isInteger(pageCount) || pageCount < 1) fail('A quantidade de páginas precisa ser maior que zero.')
  if (!Array.isArray(value.tracks) || !Array.isArray(value.cues)) fail('Faixas ou marcações inválidas.')

  const pdf = safeAssetPath(value.pdf, id, 'PDF')
  if (!pdf.toLowerCase().endsWith('.pdf')) fail('O arquivo principal precisa estar em PDF.')

  const trackIds = new Set()
  const tracks = value.tracks.map((track, index) => {
    if (!isRecord(track)) fail(`A faixa ${index + 1} está inválida.`)
    const trackId = requiredText(track.id, `ID da faixa ${index + 1}`)
    if (trackIds.has(trackId)) fail(`O ID da faixa ${trackId} aparece mais de uma vez.`)
    trackIds.add(trackId)
    const src = safeAssetPath(track.src, id, `Arquivo da faixa ${index + 1}`)
    if (!src.toLowerCase().endsWith('.mp3')) fail(`A faixa ${index + 1} precisa estar em MP3.`)
    return { id: trackId, title: requiredText(track.title, `Nome da faixa ${index + 1}`), src }
  })

  const seenTrackPages = new Set()
  const cues = value.cues.map((cue, index) => {
    if (!isRecord(cue)) fail(`A marcação ${index + 1} está inválida.`)
    const page = Number(cue.page)
    const fadeMs = Number(cue.fadeMs)
    if (!Number.isInteger(page) || page < 1 || page > pageCount) fail(`Página inválida na marcação ${index + 1}.`)
    if (!Number.isInteger(fadeMs) || fadeMs < 0 || fadeMs > 30000) fail(`Fade inválido na página ${page}.`)
    const trackId = cue.trackId
    if (typeof trackId !== 'string' || !trackIds.has(trackId)) {
      fail(`A trilha da página ${page} não existe no pacote.`)
    }
    if (cue.action !== 'start' && cue.action !== 'stop') fail(`Ação inválida na marcação da página ${page}.`)
    const trackPage = `${page}:${trackId}`
    if (seenTrackPages.has(trackPage)) fail(`A faixa ${trackId} possui mais de uma marcação na página ${page}.`)
    seenTrackPages.add(trackPage)
    return { page, trackId, action: cue.action, fadeMs }
  })

  const cover = value.cover === undefined ? undefined : safeAssetPath(value.cover, id, 'Capa')
  if (cover && !/\.(jpe?g|png|webp)$/i.test(cover)) fail('A capa precisa ser JPG, PNG ou WebP.')

  for (const path of [pdf, ...(cover ? [cover] : []), ...tracks.map((track) => track.src)]) {
    if (!archiveFiles.has(`public/${path}`)) fail(`O arquivo referenciado não está no ZIP: ${path}`)
  }

  return {
    id,
    title,
    subtitle: typeof value.subtitle === 'string' ? value.subtitle.trim() : '',
    description: typeof value.description === 'string' ? value.description.trim() : '',
    author: typeof value.author === 'string' ? value.author.trim() : '',
    pageCount,
    pdf,
    ...(cover ? { cover } : {}),
    tracks,
    cues,
  }
}

async function main() {
  const [bundlePath, ...options] = process.argv.slice(2)
  if (!bundlePath) fail('Uso: npm run comic:import -- caminho/para/hq-publicacao.zip [--replace]')

  const replace = options.includes('--replace')
  const bundle = new Uint8Array(await readFile(resolve(bundlePath)))
  const entries = unzipSync(bundle)
  const manifestBytes = entries['manifest.json']
  if (!manifestBytes) fail('O ZIP não contém manifest.json.')

  const archiveFiles = new Map()
  for (const [path, data] of Object.entries(entries)) {
    if (path === 'manifest.json' || path.endsWith('/')) continue
    if (!path.startsWith('public/content/comics/')) fail(`Caminho inesperado no ZIP: ${path}`)
    archiveFiles.set(path, data)
  }

  const manifest = validateManifest(JSON.parse(strFromU8(manifestBytes)), archiveFiles)
  const catalogPath = resolve('public/content/catalog.json')
  let catalog = { comics: [] }

  try {
    catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  if (!isRecord(catalog) || !Array.isArray(catalog.comics)) fail('O catálogo existente está inválido.')
  const alreadyExists = catalog.comics.some((comic) => comic?.id === manifest.id)
  if (alreadyExists && !replace) {
    fail(`A HQ "${manifest.id}" já existe. Use --replace para atualizar seus arquivos.`)
  }

  const publicRoot = resolve('public')
  for (const [archivePath, data] of archiveFiles) {
    const relativePath = archivePath.slice('public/'.length)
    const destination = resolve(publicRoot, ...relativePath.split('/'))
    if (!destination.startsWith(`${publicRoot}${sep}`)) fail(`Destino inseguro: ${relativePath}`)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, data)
  }

  const comics = catalog.comics.filter((comic) => comic?.id !== manifest.id)
  comics.push(manifest)
  await mkdir(dirname(catalogPath), { recursive: true })
  await writeFile(catalogPath, `${JSON.stringify({ comics }, null, 2)}\n`, 'utf8')

  console.log(`HQ "${manifest.title}" importada em public/content/comics/${manifest.id}/.`)
  console.log('Rode o build de produção antes de publicar a atualização.')
}

main().catch((error) => {
  console.error(`Falha na importação: ${error.message}`)
  process.exitCode = 1
})
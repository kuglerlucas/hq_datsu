import type { AudioTrack, Comic, ComicManifest, PageCue } from '../types/comic'
import { validatePageCues } from '../features/audio/pageCues'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} precisa ser preenchido.`)
  }

  return value.trim()
}

function optionalString(value: unknown, label: string): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new Error(`${label} precisa ser texto.`)
  return value.trim()
}

function assetPath(value: unknown, label: string): string {
  const path = requiredString(value, label)

  if (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes(':') ||
    path.split('/').some((part) => part === '..' || part === '.')
  ) {
    throw new Error(`${label} precisa ser um caminho relativo seguro.`)
  }

  return path
}

function assetUrl(path: string, baseUrl: string): string {
  const prefix = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${prefix}${path.replace(/^\/+/, '')}`
}

function parseTrack(value: unknown, index: number): AudioTrack {
  if (!isRecord(value)) throw new Error(`A faixa ${index + 1} está inválida.`)

  const src = assetPath(value.src, `Arquivo da faixa ${index + 1}`)
  if (!src.toLowerCase().endsWith('.mp3')) {
    throw new Error(`A faixa ${index + 1} precisa estar em MP3.`)
  }

  return {
    id: requiredString(value.id, `ID da faixa ${index + 1}`),
    title: requiredString(value.title, `Nome da faixa ${index + 1}`),
    src,
  }
}

function parseCue(value: unknown, index: number): PageCue {
  if (!isRecord(value)) throw new Error(`A marcação ${index + 1} está inválida.`)

  const trackId = value.trackId
  const action = value.action
  if (typeof trackId !== 'string' || (action !== 'start' && action !== 'stop')) {
    throw new Error(`A trilha ou a ação da marcação ${index + 1} está inválida.`)
  }

  if (typeof value.page !== 'number' || typeof value.fadeMs !== 'number') {
    throw new Error(`A marcação ${index + 1} precisa ter página e duração.`)
  }

  return { page: value.page, trackId, action, fadeMs: value.fadeMs }
}

function parseComic(value: unknown, index: number, baseUrl: string): Comic {
  if (!isRecord(value)) throw new Error(`A HQ ${index + 1} está inválida.`)

  const id = requiredString(value.id, `ID da HQ ${index + 1}`)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`O ID da HQ "${id}" precisa usar letras minúsculas, números e hífens.`)
  }

  if (!Number.isInteger(value.pageCount) || Number(value.pageCount) < 1) {
    throw new Error(`A HQ "${id}" precisa informar a quantidade de páginas.`)
  }

  if (!Array.isArray(value.tracks) || !Array.isArray(value.cues)) {
    throw new Error(`As faixas ou marcações da HQ "${id}" estão inválidas.`)
  }

  const tracks = value.tracks.map(parseTrack)
  const trackIds = tracks.map((track) => track.id)
  if (new Set(trackIds).size !== trackIds.length) {
    throw new Error(`A HQ "${id}" possui IDs de faixa repetidos.`)
  }

  const cues = value.cues.map(parseCue)
  const cueErrors = validatePageCues(cues, Number(value.pageCount), trackIds)
  if (cueErrors.length > 0) {
    throw new Error(`A HQ "${id}" possui marcações inválidas: ${cueErrors.join(' ')}`)
  }

  const pdf = assetPath(value.pdf, `PDF da HQ "${id}"`)
  const cover = value.cover === undefined ? undefined : assetPath(value.cover, `Capa da HQ "${id}"`)

  return {
    id,
    title: requiredString(value.title, `Título da HQ "${id}"`),
    subtitle: optionalString(value.subtitle, `Subtítulo da HQ "${id}"`),
    description: optionalString(value.description, `Descrição da HQ "${id}"`),
    author: optionalString(value.author, `Autoria da HQ "${id}"`),
    pageCount: Number(value.pageCount),
    pdfUrl: assetUrl(pdf, baseUrl),
    coverUrl: cover ? assetUrl(cover, baseUrl) : undefined,
    tracks: tracks.map((track) => ({ ...track, src: assetUrl(track.src, baseUrl) })),
    cues,
  }
}

export function parseComicCatalog(value: unknown, baseUrl = import.meta.env.BASE_URL): Comic[] {
  if (!isRecord(value) || !Array.isArray(value.comics)) {
    throw new Error('O catálogo não possui uma lista de HQs válida.')
  }

  const comics = value.comics.map((comic, index) => parseComic(comic, index, baseUrl))
  const ids = comics.map((comic) => comic.id)
  if (new Set(ids).size !== ids.length) throw new Error('O catálogo possui IDs de HQ repetidos.')
  return comics
}

export async function loadComicCatalog(): Promise<Comic[]> {
  if (import.meta.env.DEV) {
    const localResponse = await fetch('/__local/catalog.json')
    if (localResponse.ok) return parseComicCatalog(await localResponse.json())
    if (localResponse.status !== 404) {
      throw new Error(`Falha ao carregar o catálogo local (${localResponse.status}).`)
    }
  }

  const response = await fetch(`${import.meta.env.BASE_URL}content/catalog.json`)
  if (!response.ok) throw new Error(`Falha ao carregar o catálogo (${response.status}).`)
  return parseComicCatalog(await response.json())
}

export function toManifest(comic: Comic): ComicManifest {
  const baseUrl = import.meta.env.BASE_URL
  const relativeAsset = (url: string) => url.startsWith(baseUrl) ? url.slice(baseUrl.length) : url

  return {
    id: comic.id,
    title: comic.title,
    subtitle: comic.subtitle,
    description: comic.description,
    author: comic.author,
    pageCount: comic.pageCount,
    pdf: relativeAsset(comic.pdfUrl),
    cover: comic.coverUrl ? relativeAsset(comic.coverUrl) : undefined,
    tracks: comic.tracks.map((track) => ({ ...track, src: relativeAsset(track.src) })),
    cues: comic.cues,
  }
}
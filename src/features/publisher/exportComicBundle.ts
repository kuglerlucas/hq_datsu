import { strToU8, zipSync } from 'fflate'
import type { Comic, ComicManifest, PageCue } from '../../types/comic'
import { validatePageCues } from '../audio/pageCues'

export const MAX_ASSET_BYTES = 95 * 1024 * 1024
export const MAX_COMIC_SOURCE_BYTES = 250 * 1024 * 1024

export type DraftTrack = {
  id: string
  title: string
  file: File
}

export type ComicDraft = {
  title: string
  subtitle: string
  description: string
  author: string
  pageCount: number
  pdfFile: File | null
  coverFile: File | null
  tracks: DraftTrack[]
  cues: PageCue[]
}

export function comicSlug(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)

  return slug || 'hq-datsu'
}

function safeFilename(filename: string, fallbackExtension: string): string {
  const extensionMatch = filename.match(/\.[a-z0-9]{1,8}$/i)
  const extension = extensionMatch?.[0].toLowerCase() ?? fallbackExtension
  const rawName = extensionMatch ? filename.slice(0, -extensionMatch[0].length) : filename
  const stem = comicSlug(rawName).slice(0, 48)
  return `${stem}${extension}`
}

function validCover(file: File): boolean {
  return /\.(jpe?g|png|webp)$/i.test(file.name)
}

export function validateComicDraft(draft: ComicDraft): string[] {
  const errors: string[] = []

  if (!draft.title.trim()) errors.push('Informe o título da HQ.')
  if (!draft.pdfFile) errors.push('Adicione o PDF da HQ.')
  if (draft.pdfFile && !draft.pdfFile.name.toLowerCase().endsWith('.pdf')) {
    errors.push('O arquivo principal precisa estar em PDF.')
  }
  if (!Number.isInteger(draft.pageCount) || draft.pageCount < 1) {
    errors.push('O PDF ainda não foi lido ou não possui páginas.')
  }

  const trackIds = draft.tracks.map((track) => track.id)
  if (new Set(trackIds).size !== trackIds.length) errors.push('Há IDs de faixa repetidos.')

  for (const track of draft.tracks) {
    if (!track.file.name.toLowerCase().endsWith('.mp3')) {
      errors.push(`"${track.file.name}" precisa estar em MP3.`)
    }
  }

  if (draft.coverFile && !validCover(draft.coverFile)) {
    errors.push('A capa precisa estar em JPG, PNG ou WebP.')
  }

  const files = [draft.pdfFile, draft.coverFile, ...draft.tracks.map((track) => track.file)]
    .filter((file): file is File => file !== null)

  if (files.some((file) => file.size === 0)) errors.push('Remova os arquivos vazios.')
  if (files.some((file) => file.size > MAX_ASSET_BYTES)) {
    errors.push('Cada arquivo precisa ter menos de 95 MiB para publicação simples pelo GitHub.')
  }
  if (files.reduce((total, file) => total + file.size, 0) > MAX_COMIC_SOURCE_BYTES) {
    errors.push('O conjunto desta HQ ultrapassa 250 MiB; reduza ou comprima os arquivos.')
  }

  if (draft.pageCount > 0) {
    errors.push(...validatePageCues(draft.cues, draft.pageCount, trackIds))
  }

  return [...new Set(errors)]
}

function createManifest(draft: ComicDraft, slug: string): ComicManifest {
  if (!draft.pdfFile) throw new Error('Adicione o PDF da HQ.')

  const directory = `content/comics/${slug}`
  const pdf = `${directory}/${safeFilename(draft.pdfFile.name, '.pdf')}`
  const cover = draft.coverFile
    ? `${directory}/cover-${safeFilename(draft.coverFile.name, '.jpg')}`
    : undefined
  const tracks = draft.tracks.map((track, index) => ({
    id: track.id,
    title: track.title,
    src: `${directory}/audio/${String(index + 1).padStart(2, '0')}-${safeFilename(track.file.name, '.mp3')}`,
  }))

  return {
    id: slug,
    title: draft.title.trim(),
    subtitle: draft.subtitle.trim(),
    description: draft.description.trim(),
    author: draft.author.trim(),
    pageCount: draft.pageCount,
    pdf,
    cover,
    tracks,
    cues: draft.cues.map(({ page, trackId, action, fadeMs }) => ({ page, trackId, action, fadeMs })),
  }
}

export async function createComicBundle(draft: ComicDraft): Promise<Uint8Array> {
  const errors = validateComicDraft(draft)
  if (errors.length > 0) throw new Error(errors.join('\n'))

  const manifest = createManifest(draft, comicSlug(draft.title))
  const files: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    [`public/${manifest.pdf}`]: new Uint8Array(await draft.pdfFile!.arrayBuffer()),
  }

  if (draft.coverFile && manifest.cover) {
    files[`public/${manifest.cover}`] = new Uint8Array(await draft.coverFile.arrayBuffer())
  }

  for (const [index, track] of draft.tracks.entries()) {
    const manifestTrack = manifest.tracks[index]
    if (manifestTrack) {
      files[`public/${manifestTrack.src}`] = new Uint8Array(await track.file.arrayBuffer())
    }
  }

  return zipSync(files, { level: 6 })
}

export function createComicPreview(draft: ComicDraft): { comic: Comic; urls: string[] } {
  if (!draft.pdfFile) throw new Error('Adicione o PDF da HQ antes de abrir a prévia.')

  const urls: string[] = []
  const createUrl = (file: File) => {
    const url = URL.createObjectURL(file)
    urls.push(url)
    return url
  }

  return {
    comic: {
      id: comicSlug(draft.title),
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim(),
      description: draft.description.trim(),
      author: draft.author.trim(),
      pageCount: draft.pageCount,
      pdfUrl: createUrl(draft.pdfFile),
      coverUrl: draft.coverFile ? createUrl(draft.coverFile) : undefined,
      tracks: draft.tracks.map((track) => ({
        id: track.id,
        title: track.title,
        src: createUrl(track.file),
      })),
      cues: draft.cues,
    },
    urls,
  }
}
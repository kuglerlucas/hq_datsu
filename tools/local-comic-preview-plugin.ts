import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { IncomingMessage, ServerResponse } from 'node:http'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import type { Plugin } from 'vite'

type LocalPreviewConfig = {
  sourceRoot: string
  sourceFiles: Record<string, string>
  comics: Array<{
    id: string
    pdf: string
    cover?: string
    tracks: Array<{ src: string }>
    [key: string]: unknown
  }>
}

type LocalCatalog = {
  comics: LocalPreviewConfig['comics']
  assets: Map<string, string>
}

function safeRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\\') || isAbsolute(value)) {
    return false
  }

  return !value.split('/').some((part) => part === '' || part === '.' || part === '..')
}

function assetToken(assetPath: string): string {
  const digest = createHash('sha256').update(assetPath).digest('hex').slice(0, 24)
  return `${digest}${extname(assetPath).toLowerCase()}`
}

async function readLocalCatalog(
  workspaceRoot: string,
  configPath: string,
): Promise<LocalCatalog | null> {
  let config: LocalPreviewConfig

  try {
    config = JSON.parse(await readFile(configPath, 'utf8')) as LocalPreviewConfig
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }

  if (
    !safeRelativePath(config.sourceRoot) ||
    !Array.isArray(config.comics) ||
    typeof config.sourceFiles !== 'object' ||
    config.sourceFiles === null
  ) {
    throw new Error('A configuração local da HQ está inválida.')
  }

  const workspace = await realpath(workspaceRoot)
  const sourceRoot = await realpath(resolve(workspace, config.sourceRoot))
  const workspaceRelative = relative(workspace, sourceRoot)
  if (workspaceRelative.startsWith('..') || isAbsolute(workspaceRelative)) {
    throw new Error('A pasta de origem local precisa estar dentro do projeto.')
  }

  const assets = new Map<string, string>()
  const comics = structuredClone(config.comics)

  for (const comic of comics) {
    if (!Array.isArray(comic.tracks)) throw new Error(`As trilhas de "${comic.id}" estão inválidas.`)

    const fields = [comic.pdf, comic.cover, ...comic.tracks.map((track) => track.src)]
      .filter((value): value is string => typeof value === 'string')

    for (const field of fields) {
      if (!safeRelativePath(field)) throw new Error(`Caminho de asset inválido em "${comic.id}".`)

      const sourceRelative = config.sourceFiles[field]
      if (!safeRelativePath(sourceRelative)) {
        throw new Error(`A origem local de "${field}" não está configurada.`)
      }

      const candidate = resolve(sourceRoot, sourceRelative)
      const resolvedSource = await realpath(candidate)
      const relativeSource = relative(sourceRoot, resolvedSource)
      if (relativeSource.startsWith('..') || isAbsolute(relativeSource)) {
        throw new Error(`A origem de "${field}" está fora da pasta autorizada.`)
      }

      const fileInfo = await stat(resolvedSource)
      if (!fileInfo.isFile()) throw new Error(`"${sourceRelative}" não é um arquivo.`)

      const token = assetToken(field)
      assets.set(token, resolvedSource)
      const devUrl = `__local/assets/${token}`

      if (comic.pdf === field) comic.pdf = devUrl
      if (comic.cover === field) comic.cover = devUrl
      for (const track of comic.tracks) {
        if (track.src === field) track.src = devUrl
      }
    }
  }

  return { comics, assets }
}

function parseByteRange(value: string | undefined, fileSize: number): { start: number; end: number } | null {
  if (!value) return null

  const match = value.match(/^bytes=(\d*)-(\d*)$/)
  if (!match || (!match[1] && !match[2])) return null

  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null
    return { start: Math.max(0, fileSize - suffixLength), end: fileSize - 1 }
  }

  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : fileSize - 1
  if (!Number.isInteger(start) || !Number.isInteger(requestedEnd) || start >= fileSize || requestedEnd < start) {
    return null
  }

  return { start, end: Math.min(requestedEnd, fileSize - 1) }
}

function mimeType(filePath: string): string {
  const extension = extname(filePath).toLowerCase()
  if (extension === '.pdf') return 'application/pdf'
  if (extension === '.mp3') return 'audio/mpeg'
  if (extension === '.png') return 'image/png'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  return 'application/octet-stream'
}

function sendError(response: ServerResponse, status: number, message: string): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'text/plain; charset=utf-8')
  response.end(message)
}

async function sendAsset(
  request: IncomingMessage,
  response: ServerResponse,
  filePath: string,
): Promise<void> {
  const fileInfo = await stat(filePath)
  const range = request.headers.range
  const parsedRange = range ? parseByteRange(range, fileInfo.size) : null

  response.setHeader('Accept-Ranges', 'bytes')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', mimeType(filePath))

  if (range && !parsedRange) {
    response.statusCode = 416
    response.setHeader('Content-Range', `bytes */${fileInfo.size}`)
    response.end()
    return
  }

  const start = parsedRange?.start ?? 0
  const end = parsedRange?.end ?? fileInfo.size - 1
  response.setHeader('Content-Length', String(end - start + 1))

  if (parsedRange) {
    response.statusCode = 206
    response.setHeader('Content-Range', `bytes ${start}-${end}/${fileInfo.size}`)
  }

  if (request.method === 'HEAD') {
    response.end()
    return
  }

  const stream = createReadStream(filePath, { start, end })
  stream.on('error', () => {
    if (!response.headersSent) sendError(response, 500, 'Falha ao ler o asset local.')
    else response.destroy()
  })
  stream.pipe(response)
}

export function localComicPreviewPlugin(): Plugin {
  const workspaceRoot = process.cwd()
  const configPath = resolve(workspaceRoot, '.local/comic-preview.json')

  return {
    name: 'datsu-local-comic-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestUrl = new URL(request.url ?? '/', 'http://localhost')
        if (!requestUrl.pathname.startsWith('/__local/')) {
          next()
          return
        }

        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.statusCode = 405
          response.setHeader('Allow', 'GET, HEAD')
          response.end()
          return
        }

        void readLocalCatalog(workspaceRoot, configPath)
          .then(async (catalog) => {
            if (!catalog) {
              sendError(response, 404, 'Nenhum catálogo de prévia local está configurado.')
              return
            }

            if (requestUrl.pathname === '/__local/catalog.json') {
              response.setHeader('Cache-Control', 'no-store')
              response.setHeader('Content-Type', 'application/json; charset=utf-8')
              response.end(JSON.stringify({ comics: catalog.comics }))
              return
            }

            const token = requestUrl.pathname.slice('/__local/assets/'.length)
            if (!token || token.includes('/')) {
              sendError(response, 404, 'Asset local não encontrado.')
              return
            }

            const assetPath = catalog.assets.get(token)
            if (!assetPath) {
              sendError(response, 404, 'Asset local não encontrado.')
              return
            }

            await sendAsset(request, response, assetPath)
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : 'Erro ao carregar a prévia local.'
            sendError(response, 500, message)
          })
      })
    },
  }
}
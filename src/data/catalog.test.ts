import { describe, expect, it } from 'vitest'
import { parseComicCatalog } from './catalog'

const manifest = {
  comics: [
    {
      id: 'first-signal',
      title: 'Primeiro sinal',
      subtitle: '',
      description: '',
      author: 'Datsu',
      pageCount: 10,
      pdf: 'content/comics/first-signal/comic.pdf',
      tracks: [{ id: 'arrival', title: 'Chegada', src: 'content/comics/first-signal/arrival.mp3' }],
      cues: [{ page: 1, trackId: 'arrival', action: 'start', fadeMs: 1200 }],
    },
  ],
}

describe('parseComicCatalog', () => {
  it('resolves relative media paths against the deployment base', () => {
    const [comic] = parseComicCatalog(manifest, '/datsu-reader/')

    expect(comic.pdfUrl).toBe('/datsu-reader/content/comics/first-signal/comic.pdf')
    expect(comic.tracks[0]?.src).toBe('/datsu-reader/content/comics/first-signal/arrival.mp3')
  })

  it('rejects unsafe asset paths and cues that reference missing tracks', () => {
    const unsafe = structuredClone(manifest)
    unsafe.comics[0]!.pdf = '../private.pdf'
    expect(() => parseComicCatalog(unsafe)).toThrow('caminho relativo seguro')

    const missingTrack = structuredClone(manifest)
    missingTrack.comics[0]!.cues[0]!.trackId = 'unknown'
    expect(() => parseComicCatalog(missingTrack)).toThrow('trilha da página 1 não existe')
  })
})
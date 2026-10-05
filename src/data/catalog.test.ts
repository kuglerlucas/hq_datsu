import { describe, expect, it } from 'vitest'
import { activeTrackIdsForPage } from '../features/audio/pageCues'
import { parseComicCatalog } from './catalog'
import publicCatalog from '../../public/content/catalog.json'

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

  it('loads Volume 2 with zero-fade cues and only one active track at a time', () => {
    const comics = parseComicCatalog(publicCatalog, '/')
    const volumeTwo = comics.find((comic) => comic.id === 'torneio-infernal-aurora-vs-drekalia-2')

    expect(volumeTwo).toBeDefined()
    expect(volumeTwo?.pageCount).toBe(76)
    expect(volumeTwo?.tracks.map((track) => track.id)).toEqual([
      'sociedade',
      'suspense-1',
      'suspense-2',
      'exploracao-1',
      'combate-1',
      'heroismo',
      'coracao',
      'combate-2',
    ])
    expect(volumeTwo?.cues.every((cue) => cue.fadeMs === 0)).toBe(true)

    const expectedTrackByPage = new Map<number, string>([
      [2, 'sociedade'],
      [8, 'sociedade'],
      [10, 'suspense-1'],
      [13, 'suspense-2'],
      [18, 'exploracao-1'],
      [26, 'combate-1'],
      [30, 'heroismo'],
      [35, 'exploracao-1'],
      [49, 'coracao'],
      [61, 'combate-2'],
    ])
    const silentPages = new Set([1, 9, 12, 17, 25, 29, 34, 48, 60, 71, 72, 76])

    for (let page = 1; page <= 76; page += 1) {
      const activeTracks = activeTrackIdsForPage(volumeTwo!.cues, page)
      expect(activeTracks.size, `active tracks on page ${page}`).toBeLessThanOrEqual(1)

      const expectedTrack = expectedTrackByPage.get(page)
      if (expectedTrack) {
        expect([...activeTracks], `track on page ${page}`).toEqual([expectedTrack])
      } else if (silentPages.has(page)) {
        expect(activeTracks.size, `silence on page ${page}`).toBe(0)
      }
    }
  })
})
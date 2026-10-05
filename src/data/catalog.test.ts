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

    const expectedTrackByPage = [
      { start: 2, end: 9, trackId: 'sociedade' },
      { start: 10, end: 12, trackId: 'suspense-1' },
      { start: 13, end: 17, trackId: 'suspense-2' },
      { start: 18, end: 25, trackId: 'exploracao-1' },
      { start: 26, end: 29, trackId: 'combate-1' },
      { start: 30, end: 34, trackId: 'heroismo' },
      { start: 35, end: 48, trackId: 'exploracao-1' },
      { start: 49, end: 60, trackId: 'coracao' },
      { start: 61, end: 71, trackId: 'combate-2' },
    ]

    for (let page = 1; page <= 76; page += 1) {
      const activeTracks = activeTrackIdsForPage(volumeTwo!.cues, page)
      expect(activeTracks.size, `active tracks on page ${page}`).toBeLessThanOrEqual(1)

      const expectedTrack = expectedTrackByPage.find((segment) => page >= segment.start && page <= segment.end)?.trackId
      if (expectedTrack) {
        expect([...activeTracks], `track on page ${page}`).toEqual([expectedTrack])
      } else {
        expect(activeTracks.size, `silence on page ${page}`).toBe(0)
      }
    }
  })
})
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { createComicBundle, type ComicDraft } from './exportComicBundle'

function createDraft(): ComicDraft {
  return {
    title: 'Além da Neblina',
    subtitle: 'Volume 01',
    description: '',
    author: 'Datsu',
    pageCount: 8,
    pdfFile: new File([new Uint8Array([1, 2, 3])], 'Minha HQ.pdf', { type: 'application/pdf' }),
    coverFile: null,
    tracks: [
      { id: 'track-1', title: 'Chegada', file: new File([new Uint8Array([4, 5])], 'Chegada.mp3') },
    ],
    cues: [{ page: 1, trackId: 'track-1', action: 'start', fadeMs: 1200 }],
  }
}

describe('createComicBundle', () => {
  it('exports a manifest and media paths that the local importer can consume', async () => {
    const archive = unzipSync(await createComicBundle(createDraft()))
    const manifest = JSON.parse(strFromU8(archive['manifest.json']!)) as {
      id: string
      pdf: string
      tracks: { src: string }[]
    }

    expect(manifest.id).toBe('alem-da-neblina')
    expect(archive[`public/${manifest.pdf}`]).toBeDefined()
    expect(archive[`public/${manifest.tracks[0]!.src}`]).toBeDefined()
  })

  it('refuses an out-of-range cue before creating a bundle', async () => {
    const draft = createDraft()
    draft.cues = [{ page: 9, trackId: 'track-1', action: 'start', fadeMs: 1000 }]

    await expect(createComicBundle(draft)).rejects.toThrow('fora dos limites')
  })
})
import { describe, expect, it } from 'vitest'
import type { PageCue } from '../../types/comic'
import { activeSegmentStartCueForTrackAtPage, activeTrackIdsForPage, latestCueForTrackAtPage, validatePageCues } from './pageCues'

const cues: PageCue[] = [
  { page: 1, trackId: 'arrival', action: 'start', fadeMs: 1200 },
  { page: 5, trackId: 'arrival', action: 'stop', fadeMs: 800 },
  { page: 6, trackId: 'descent', action: 'start', fadeMs: 2400 },
]

const tournamentCues: PageCue[] = [
  { page: 2, trackId: 'torneio', action: 'start', fadeMs: 2000 },
  { page: 7, trackId: 'isaac', action: 'start', fadeMs: 2000 },
  { page: 13, trackId: 'torneio', action: 'stop', fadeMs: 2000 },
  { page: 14, trackId: 'isaac', action: 'stop', fadeMs: 2000 },
  { page: 14, trackId: 'torneio', action: 'start', fadeMs: 2000 },
  { page: 27, trackId: 'torneio', action: 'stop', fadeMs: 2000 },
  { page: 28, trackId: 'drekai-1', action: 'start', fadeMs: 2000 },
  { page: 36, trackId: 'drekai-1', action: 'stop', fadeMs: 2000 },
  { page: 37, trackId: 'kurogane', action: 'start', fadeMs: 2000 },
  { page: 41, trackId: 'kurogane', action: 'stop', fadeMs: 2000 },
  { page: 42, trackId: 'drekai-2', action: 'start', fadeMs: 2000 },
  { page: 53, trackId: 'drekai-2', action: 'stop', fadeMs: 2000 },
  { page: 54, trackId: 'menkhir', action: 'start', fadeMs: 2000 },
  { page: 70, trackId: 'menkhir', action: 'stop', fadeMs: 2000 },
]

describe('activeTrackIdsForPage', () => {
  it('chooses only the most recently started track and rejects invalid pages', () => {
    expect(activeTrackIdsForPage(tournamentCues, 0).size).toBe(0)
    expect(activeTrackIdsForPage(tournamentCues, Number.NaN).size).toBe(0)
    expect([...activeTrackIdsForPage(tournamentCues, 8)]).toEqual(['isaac'])
    expect([...activeTrackIdsForPage(tournamentCues, 14)]).toEqual(['torneio'])
  })

  it('resolves page jumps from the last event per track without activating skipped cues', () => {
    expect([...activeTrackIdsForPage(tournamentCues, 30)]).toEqual(['drekai-1'])
    expect([...activeTrackIdsForPage(tournamentCues, 54)]).toEqual(['menkhir'])
    expect([...activeTrackIdsForPage(tournamentCues, 73)]).toEqual([])
  })

  it('returns a track-specific fade event for the destination page', () => {
    expect(latestCueForTrackAtPage(tournamentCues, 'kurogane', 39)).toEqual(tournamentCues[8])
    expect(latestCueForTrackAtPage(tournamentCues, 'drekai-1', 39)).toEqual(tournamentCues[7])
    expect(latestCueForTrackAtPage(tournamentCues, 'isaac', 2)).toBeNull()
  })

  it('keeps consecutive starts in one segment until an explicit stop', () => {
    expect(activeSegmentStartCueForTrackAtPage(cues, 'arrival', 4)).toBe(cues[0])
    expect(activeSegmentStartCueForTrackAtPage(cues, 'arrival', 6)).toBeNull()
    expect(activeSegmentStartCueForTrackAtPage(tournamentCues, 'torneio', 14)).toBe(tournamentCues[4])
  })
})

describe('validatePageCues', () => {
  it('accepts valid track changes and silence cues', () => {
    expect(validatePageCues(cues, 12, ['arrival', 'descent'])).toEqual([])
    expect(validatePageCues(tournamentCues, 73, ['kurogane', 'isaac', 'torneio', 'drekai-1', 'drekai-2', 'menkhir'])).toEqual([])
  })

  it('reports duplicate track pages, missing tracks, invalid pages, actions and fade lengths', () => {
    const invalidCues: PageCue[] = [
      { page: 5, trackId: 'missing', action: 'start', fadeMs: -1 },
      { page: 5, trackId: 'arrival', action: 'stop', fadeMs: 31000 },
      { page: 13, trackId: 'arrival', action: 'start', fadeMs: 1000 },
      { page: 13, trackId: 'arrival', action: 'stop', fadeMs: 1000 },
    ]

    expect(validatePageCues(invalidCues, 12, ['arrival'])).toHaveLength(6)
  })
})

describe('Torneio Infernal soundtrack boundaries', () => {
  it('plays one track at a time and keeps Kurogane only in its return segment', () => {
    const expectedTracks = new Map<number, string[]>([
      [1, []], [2, ['torneio']], [6, ['torneio']], [7, ['isaac']],
      [13, ['isaac']], [14, ['torneio']], [26, ['torneio']], [27, []],
      [28, ['drekai-1']], [35, ['drekai-1']], [36, []], [37, ['kurogane']],
      [41, []], [42, ['drekai-2']], [52, ['drekai-2']], [53, []],
      [54, ['menkhir']], [69, ['menkhir']], [70, []], [73, []],
    ])

    for (const [page, trackIds] of expectedTracks) {
      expect([...activeTrackIdsForPage(tournamentCues, page)].sort(), `page ${page}`).toEqual(trackIds.sort())
    }

    expect(latestCueForTrackAtPage(tournamentCues, 'torneio', 2)?.action).toBe('start')
    expect(latestCueForTrackAtPage(tournamentCues, 'torneio', 13)?.action).toBe('stop')
    expect(latestCueForTrackAtPage(tournamentCues, 'torneio', 14)?.action).toBe('start')
    expect(latestCueForTrackAtPage(tournamentCues, 'torneio', 27)?.action).toBe('stop')
    expect(latestCueForTrackAtPage(tournamentCues, 'kurogane', 36)).toBeNull()
    expect(latestCueForTrackAtPage(tournamentCues, 'kurogane', 37)?.action).toBe('start')
    expect(latestCueForTrackAtPage(tournamentCues, 'kurogane', 41)?.action).toBe('stop')
  })
})
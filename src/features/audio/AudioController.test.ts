import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AudioTrack, PageCue } from '../../types/comic'
import { AudioController } from './AudioController'
import { activeTrackIdsForPage } from './pageCues'

class FakeAudioParam {
  value = 0
  cancelAndHoldAtTime(): void {}
  cancelScheduledValues(): void {}
  setValueAtTime(value: number): void { this.value = value }
  setTargetAtTime(value: number): void { this.value = value }
  linearRampToValueAtTime(value: number): void { this.value = value }
}

class FakeAudioNode {
  gain = new FakeAudioParam()
  connect(): void {}
}

class FakeAudioContext {
  static latest: FakeAudioContext
  static gains: FakeAudioNode[] = []
  state = 'running'
  currentTime = 0
  resumeCalls = 0
  destination = new FakeAudioNode()

  constructor() {
    FakeAudioContext.latest = this
    FakeAudioContext.gains = []
  }

  createGain(): FakeAudioNode {
    const node = new FakeAudioNode()
    FakeAudioContext.gains.push(node)
    return node
  }
  createMediaElementSource(): FakeAudioNode { return new FakeAudioNode() }
  async resume(): Promise<void> { this.resumeCalls += 1 }
  async close(): Promise<void> {}
}

class FakeAudioElement {
  static instances: FakeAudioElement[] = []
  static playResult: Promise<void> = Promise.resolve()

  readonly src: string
  preload = 'auto'
  paused = true
  ended = false
  currentTime = 0
  playCalls = 0

  constructor(src = '') {
    this.src = src
    FakeAudioElement.instances.push(this)
  }

  play(): Promise<void> {
    this.playCalls += 1
    this.paused = false
    this.ended = false
    return FakeAudioElement.playResult
  }

  pause(): void { this.paused = true }
  removeAttribute(): void {}
  load(): void {}
}

const tracks: AudioTrack[] = [{ id: 'isaac', title: 'Isaac', src: '/isaac.mp3' }]
const cues: PageCue[] = [
  { page: 7, trackId: 'isaac', action: 'start', fadeMs: 0 },
  { page: 8, trackId: 'isaac', action: 'start', fadeMs: 0 },
]

const crossfadeTracks: AudioTrack[] = [
  { id: 'isaac', title: 'Isaac', src: '/isaac.mp3' },
  { id: 'drekai', title: 'Drekai', src: '/drekai.mp3' },
]

const tournamentTracks: AudioTrack[] = [
  { id: 'torneio', title: 'Torneio', src: '/torneio.mp3' },
  { id: 'isaac', title: 'Isaac', src: '/isaac.mp3' },
  { id: 'kurogane', title: 'Kurogane', src: '/kurogane.mp3' },
]

describe('AudioController', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    FakeAudioElement.instances = []
    FakeAudioElement.playResult = Promise.resolve()
    FakeAudioContext.gains = []
  })

  it('reuses an in-flight play when the reader turns within the same track segment', async () => {
    let resolvePlayback!: () => void
    FakeAudioElement.playResult = new Promise<void>((resolve) => { resolvePlayback = resolve })

    vi.stubGlobal('Audio', FakeAudioElement)
    vi.stubGlobal('window', {
      AudioContext: FakeAudioContext,
      setTimeout,
      clearTimeout,
    })

    const controller = new AudioController(tracks)
    const firstPage = controller.playForPage(7, cues)

    await vi.waitFor(() => expect(FakeAudioElement.instances[0]?.playCalls).toBe(1))
    const element = FakeAudioElement.instances[0]!
    element.currentTime = 4

    const nextPage = controller.playForPage(8, cues)
    expect(element.currentTime).toBe(4)
    expect(element.playCalls).toBe(1)

    resolvePlayback()
    await Promise.all([firstPage, nextPage])
    expect(element.currentTime).toBe(4)
    expect(FakeAudioContext.gains[1]?.gain.value).toBe(1)

    controller.dispose()
  })

  it('resumes a manually paused track from its current position', async () => {
    vi.stubGlobal('Audio', FakeAudioElement)
    vi.stubGlobal('window', {
      AudioContext: FakeAudioContext,
      setTimeout,
      clearTimeout,
    })

    const controller = new AudioController(tracks)
    await controller.playForPage(7, cues, true)
    const element = FakeAudioElement.instances[0]!
    element.currentTime = 12

    controller.pause()
    await controller.playForPage(8, cues, true)

    expect(element.currentTime).toBe(12)
    expect(element.playCalls).toBe(2)
    expect(FakeAudioElement.instances.filter((audio) => !audio.paused)).toHaveLength(1)
    controller.dispose()
  })

  it('switches tracks without playing them together and fades the final track at silence', async () => {
    vi.stubGlobal('Audio', FakeAudioElement)
    vi.stubGlobal('window', {
      AudioContext: FakeAudioContext,
      setTimeout,
      clearTimeout,
    })

    const crossfadeCues: PageCue[] = [
      { page: 7, trackId: 'isaac', action: 'start', fadeMs: 0 },
      { page: 13, trackId: 'isaac', action: 'stop', fadeMs: 2000 },
      { page: 28, trackId: 'drekai', action: 'start', fadeMs: 2000 },
      { page: 36, trackId: 'drekai', action: 'stop', fadeMs: 1500 },
    ]
    const controller = new AudioController(crossfadeTracks)

    await controller.playForPage(7, crossfadeCues, true)
    expect(FakeAudioContext.gains[1]?.gain.value).toBe(1)

    await controller.playForPage(28, crossfadeCues, true)
    expect(FakeAudioContext.gains[1]?.gain.value).toBe(0)
    expect(FakeAudioContext.gains[2]?.gain.value).toBe(1)
    expect(FakeAudioElement.instances[0]?.playCalls).toBe(1)
    expect(FakeAudioElement.instances[1]?.playCalls).toBe(1)

    await controller.playForPage(36, crossfadeCues, true)
    expect(FakeAudioContext.gains[1]?.gain.value).toBe(0)
    expect(FakeAudioContext.gains[2]?.gain.value).toBe(0)

    controller.dispose()
  })

  it('keeps one track playing, preserves it across pages and starts each cue segment once', async () => {
    vi.stubGlobal('Audio', FakeAudioElement)
    vi.stubGlobal('window', {
      AudioContext: FakeAudioContext,
      setTimeout,
      clearTimeout,
    })

    const cues: PageCue[] = [
      { page: 2, trackId: 'torneio', action: 'start', fadeMs: 2000 },
      { page: 7, trackId: 'isaac', action: 'start', fadeMs: 2000 },
      { page: 13, trackId: 'torneio', action: 'stop', fadeMs: 2000 },
      { page: 14, trackId: 'isaac', action: 'stop', fadeMs: 2000 },
      { page: 14, trackId: 'torneio', action: 'start', fadeMs: 2000 },
      { page: 27, trackId: 'torneio', action: 'stop', fadeMs: 2000 },
      { page: 37, trackId: 'kurogane', action: 'start', fadeMs: 2000 },
      { page: 41, trackId: 'kurogane', action: 'stop', fadeMs: 2000 },
    ]
    const controller = new AudioController(tournamentTracks)

    await controller.playForPage(2, cues, true)
    const torneioAudio = FakeAudioElement.instances[0]!
    torneioAudio.currentTime = 11
    expect(FakeAudioElement.instances.filter((audio) => !audio.paused)).toHaveLength(1)

    await controller.playForPage(3, cues, true)
    expect(torneioAudio.currentTime).toBe(11)
    expect(torneioAudio.playCalls).toBe(1)

    await controller.playForPage(7, cues, true)
    const isaacAudio = FakeAudioElement.instances[1]!
    expect([...activeTrackIdsForPage(cues, 7)]).toEqual(['isaac'])
    expect(torneioAudio.paused).toBe(true)
    expect(torneioAudio.playCalls).toBe(1)
    expect(isaacAudio.playCalls).toBe(1)
    expect(FakeAudioElement.instances.filter((audio) => !audio.paused)).toHaveLength(1)

    isaacAudio.currentTime = 4
    await controller.playForPage(8, cues, true)
    expect(isaacAudio.currentTime).toBe(4)
    expect(isaacAudio.playCalls).toBe(1)

    await controller.playForPage(13, cues, true)
    expect([...activeTrackIdsForPage(cues, 13)]).toEqual(['isaac'])
    expect(isaacAudio.paused).toBe(false)

    await controller.playForPage(14, cues, true)
    expect([...activeTrackIdsForPage(cues, 14)]).toEqual(['torneio'])
    expect(isaacAudio.paused).toBe(true)
    expect(torneioAudio.currentTime).toBe(0)
    expect(torneioAudio.playCalls).toBe(2)
    expect(FakeAudioElement.instances.filter((audio) => !audio.paused)).toHaveLength(1)

    await controller.playForPage(37, cues, true)
    expect([...activeTrackIdsForPage(cues, 37)]).toEqual(['kurogane'])
    expect(FakeAudioElement.instances[2]?.playCalls).toBe(1)
    expect(torneioAudio.paused).toBe(true)
    expect(FakeAudioElement.instances.filter((audio) => !audio.paused)).toHaveLength(1)

    await controller.playForPage(41, cues, true)
    expect([...activeTrackIdsForPage(cues, 41)]).toEqual([])
    await controller.playForPage(42, cues, true)
    expect(FakeAudioElement.instances.filter((audio) => !audio.paused)).toHaveLength(1)
    controller.dispose()
  })
})
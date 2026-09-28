import type { AudioTrack, PageCue } from '../../types/comic'
import { activeSegmentStartCueForTrackAtPage, activeTrackIdsForPage, latestCueForTrackAtPage } from './pageCues'

type TrackNode = {
  element: HTMLAudioElement
  gain: GainNode
}

export class AudioController {
  private readonly tracks: AudioTrack[]
  private readonly nodes = new Map<string, TrackNode>()
  private readonly pendingPlays = new Map<string, Promise<void>>()
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private activeTrackIds = new Set<string>()
  private activeSegmentKey: string | null = null
  private manuallyPaused = false
  private readonly fadeOutTimers = new Map<string, number>()
  private readonly fadeGenerations = new Map<string, number>()
  private transitionId = 0
  private volume = 0.58

  constructor(tracks: AudioTrack[]) {
    this.tracks = tracks
  }

  unlockFromGesture(): void {
    this.createGraph()
    if (this.context?.state === 'suspended') {
      void this.context.resume().catch(() => undefined)
    }
  }

  async playForPage(page: number, cues: readonly PageCue[], fromUserGesture = false): Promise<void> {
    const trackIds = activeTrackIdsForPage(cues, page)

    for (const trackId of trackIds) {
      if (!this.tracks.some((track) => track.id === trackId)) {
        throw new Error(`A trilha "${trackId}" desta página não está disponível.`)
      }
    }

    await this.transitionTo(trackIds, cues, page, fromUserGesture)
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value))

    if (this.context && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.025)
    }
  }

  pause(): void {
    this.transitionId += 1
    this.pendingPlays.clear()
    this.manuallyPaused = true
    this.clearAllFadeOutTimers()

    for (const [trackId, node] of this.nodes) {
      node.element.pause()
      if (!this.activeTrackIds.has(trackId)) {
        node.gain.gain.cancelScheduledValues(this.context?.currentTime ?? 0)
        node.gain.gain.setValueAtTime(0, this.context?.currentTime ?? 0)
      }
    }
  }

  dispose(): void {
    this.pause()

    for (const node of this.nodes.values()) {
      node.element.removeAttribute('src')
      node.element.load()
    }

    this.nodes.clear()
    void this.context?.close()
    this.context = null
    this.masterGain = null
    this.activeTrackIds.clear()
    this.activeSegmentKey = null
  }

  private async transitionTo(
    trackIds: ReadonlySet<string>,
    cues: readonly PageCue[],
    page: number,
    fromUserGesture = false,
  ): Promise<void> {
    const targetTrackId = trackIds.values().next().value ?? null
    if (!targetTrackId) {
      if (this.activeTrackIds.size === 0) return

      this.transitionId += 1
      const outgoingTrackId = this.activeTrackIds.values().next().value ?? null
      this.activeTrackIds.clear()
      this.activeSegmentKey = null
      this.manuallyPaused = false
      this.clearAllFadeOutTimers()

      if (!outgoingTrackId) return

      for (const [trackId, node] of this.nodes) {
        if (trackId === outgoingTrackId) continue
        node.element.pause()
        this.setGainImmediately(node.gain.gain, 0, this.context?.currentTime ?? 0)
      }

      const outgoingNode = this.nodes.get(outgoingTrackId)
      if (!outgoingNode) return

      const durationMs = Math.max(0, latestCueForTrackAtPage(cues, outgoingTrackId, page)?.fadeMs ?? 500)
      if (durationMs === 0 || outgoingNode.element.paused) {
        outgoingNode.element.pause()
        this.setGainImmediately(outgoingNode.gain.gain, 0, this.context?.currentTime ?? 0)
        return
      }

      const context = this.context
      const now = context?.currentTime ?? 0
      this.holdGain(outgoingNode.gain.gain, now)
      outgoingNode.gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000)
      this.scheduleFadeOut(outgoingTrackId, outgoingNode, durationMs)
      return
    }

    this.createGraph()
    const context = this.context
    const targetNode = this.nodes.get(targetTrackId)
    if (!context || !targetNode) return

    const startCue = activeSegmentStartCueForTrackAtPage(cues, targetTrackId, page)
    const segmentKey = `${targetTrackId}:${startCue?.page ?? page}`
    const sameSegment = this.activeSegmentKey === segmentKey
    const resumeManualPause = this.manuallyPaused

    if (sameSegment && !targetNode.element.paused && !targetNode.element.ended) {
      this.activeTrackIds = new Set([targetTrackId])
      this.manuallyPaused = false
      return
    }

    if (sameSegment && targetNode.element.ended && !resumeManualPause) {
      this.activeTrackIds = new Set([targetTrackId])
      this.manuallyPaused = false
      return
    }

    const transitionId = ++this.transitionId
    this.clearAllFadeOutTimers()
    this.activeTrackIds = new Set([targetTrackId])
    this.activeSegmentKey = segmentKey
    this.manuallyPaused = false

    const now = context.currentTime
    for (const [trackId, node] of this.nodes) {
      if (trackId === targetTrackId) continue
      node.element.pause()
      this.setGainImmediately(node.gain.gain, 0, now)
    }

    if (!sameSegment || (targetNode.element.ended && resumeManualPause)) {
      targetNode.element.currentTime = 0
      this.setGainImmediately(targetNode.gain.gain, 0, now)
    }

    const playPromises: Promise<void>[] = []
    const resumePromise = context.resume()
    if (fromUserGesture && targetNode.element.paused) {
      playPromises.push(this.ensureTrackPlaying(targetTrackId, targetNode))
    }

    try {
      await resumePromise
      if (transitionId !== this.transitionId) {
        await Promise.allSettled(playPromises)
        return
      }

      if (targetNode.element.paused) playPromises.push(this.ensureTrackPlaying(targetTrackId, targetNode))
      await Promise.all(playPromises)
    } catch (error) {
      await Promise.allSettled(playPromises)
      if (transitionId !== this.transitionId) return
      this.activeTrackIds.clear()
      this.activeSegmentKey = null
      targetNode.element.pause()
      this.setGainImmediately(targetNode.gain.gain, 0, context.currentTime)
      throw error
    }

    if (transitionId !== this.transitionId || sameSegment) return

    const rampStart = context.currentTime
    const durationMs = Math.max(0, startCue?.fadeMs ?? 500)
    if (durationMs === 0) {
      this.setGainImmediately(targetNode.gain.gain, 1, rampStart)
    } else {
      this.holdGain(targetNode.gain.gain, rampStart)
      targetNode.gain.gain.linearRampToValueAtTime(1, rampStart + durationMs / 1000)
    }
  }

  private createGraph(): void {
    if (this.context) return

    const context = new window.AudioContext()
    const masterGain = context.createGain()
    masterGain.gain.value = this.volume
    masterGain.connect(context.destination)

    for (const track of this.tracks) {
      const element = new Audio()
      element.preload = 'none'
      element.src = track.src

      const source = context.createMediaElementSource(element)
      const gain = context.createGain()
      gain.gain.value = 0
      source.connect(gain)
      gain.connect(masterGain)
      this.nodes.set(track.id, { element, gain })
    }

    this.context = context
    this.masterGain = masterGain
  }

  private async ensureTrackPlaying(trackId: string, node: TrackNode): Promise<void> {
    if (!node.element.paused) return

    const existingPlay = this.pendingPlays.get(trackId)
    if (existingPlay) {
      await existingPlay
      return
    }

    const playPromise = node.element.play()
    this.pendingPlays.set(trackId, playPromise)

    try {
      await playPromise
    } finally {
      if (this.pendingPlays.get(trackId) === playPromise) {
        this.pendingPlays.delete(trackId)
      }
    }
  }

  private holdGain(parameter: AudioParam, atTime: number): void {
    if (typeof parameter.cancelAndHoldAtTime === 'function') {
      parameter.cancelAndHoldAtTime(atTime)
      return
    }

    const currentValue = parameter.value
    parameter.cancelScheduledValues(atTime)
    parameter.setValueAtTime(currentValue, atTime)
  }

  private setGainImmediately(parameter: AudioParam, value: number, atTime: number): void {
    parameter.cancelScheduledValues(atTime)
    parameter.setValueAtTime(value, atTime)
  }

  private scheduleFadeOut(trackId: string, node: TrackNode, durationMs: number): void {
    const generation = (this.fadeGenerations.get(trackId) ?? 0) + 1
    this.fadeGenerations.set(trackId, generation)

    const timer = window.setTimeout(() => {
      if (this.fadeGenerations.get(trackId) !== generation || this.activeTrackIds.has(trackId)) return
      node.element.pause()
      node.gain.gain.cancelScheduledValues(this.context?.currentTime ?? 0)
      node.gain.gain.setValueAtTime(0, this.context?.currentTime ?? 0)
      this.fadeOutTimers.delete(trackId)
    }, durationMs)

    this.fadeOutTimers.set(trackId, timer)
  }

  private clearFadeOutTimer(trackId: string): void {
    const timer = this.fadeOutTimers.get(trackId)
    if (timer !== undefined) window.clearTimeout(timer)
    this.fadeOutTimers.delete(trackId)
    this.fadeGenerations.set(trackId, (this.fadeGenerations.get(trackId) ?? 0) + 1)
  }

  private clearAllFadeOutTimers(): void {
    for (const trackId of this.fadeOutTimers.keys()) this.clearFadeOutTimer(trackId)
  }
}
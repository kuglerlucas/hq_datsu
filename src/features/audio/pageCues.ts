import type { PageCue } from '../../types/comic'

export function activeTrackIdsForPage(cues: readonly PageCue[], page: number): Set<string> {
  if (!Number.isInteger(page) || page < 1) return new Set()

  const latestByTrack = new Map<string, { cue: PageCue; order: number }>()

  for (const [order, cue] of cues.entries()) {
    const current = latestByTrack.get(cue.trackId)
    if (cue.page <= page && (!current || cue.page > current.cue.page)) {
      latestByTrack.set(cue.trackId, { cue, order })
    }
  }

  let winningCue: { trackId: string; cue: PageCue; order: number } | null = null
  for (const [trackId, { cue, order }] of latestByTrack) {
    if (cue.action !== 'start') continue
    if (!winningCue || cue.page > winningCue.cue.page || (cue.page === winningCue.cue.page && order > winningCue.order)) {
      winningCue = { trackId, cue, order }
    }
  }

  return winningCue ? new Set([winningCue.trackId]) : new Set()
}

export function latestCueForTrackAtPage(
  cues: readonly PageCue[],
  trackId: string,
  page: number,
): PageCue | null {
  if (!Number.isInteger(page) || page < 1) return null

  let latestCue: PageCue | null = null
  for (const cue of cues) {
    if (cue.trackId === trackId && cue.page <= page && (!latestCue || cue.page > latestCue.page)) {
      latestCue = cue
    }
  }

  return latestCue
}

export function activeSegmentStartCueForTrackAtPage(
  cues: readonly PageCue[],
  trackId: string,
  page: number,
): PageCue | null {
  if (!Number.isInteger(page) || page < 1) return null

  const trackCues = cues
    .map((cue, order) => ({ cue, order }))
    .filter(({ cue }) => cue.trackId === trackId && cue.page <= page)
    .sort((left, right) => left.cue.page - right.cue.page || left.order - right.order)

  let startCue: PageCue | null = null
  for (const { cue } of trackCues) {
    if (cue.action === 'stop') {
      startCue = null
    } else if (!startCue) {
      startCue = cue
    }
  }

  return startCue
}

export function validatePageCues(
  cues: readonly PageCue[],
  pageCount: number,
  trackIds: readonly string[],
): string[] {
  const errors: string[] = []
  const knownTracks = new Set(trackIds)
  const seenTrackPages = new Set<string>()

  if (!Number.isInteger(pageCount) || pageCount < 1) {
    errors.push('A HQ precisa ter ao menos uma página.')
  }

  for (const cue of cues) {
    if (!Number.isInteger(cue.page) || cue.page < 1 || cue.page > pageCount) {
      errors.push(`A página ${cue.page} está fora dos limites da HQ.`)
    }

    const trackPage = `${cue.page}:${cue.trackId}`
    if (seenTrackPages.has(trackPage)) {
      errors.push(`A trilha ${cue.trackId} possui mais de uma marcação na página ${cue.page}.`)
    }
    seenTrackPages.add(trackPage)

    if (!Number.isInteger(cue.fadeMs) || cue.fadeMs < 0 || cue.fadeMs > 30000) {
      errors.push(`O fade da página ${cue.page} precisa estar entre 0 e 30 segundos.`)
    }

    if (!knownTracks.has(cue.trackId)) {
      errors.push(`A trilha da página ${cue.page} não existe.`)
    }

    if (cue.action !== 'start' && cue.action !== 'stop') {
      errors.push(`A ação da marcação na página ${cue.page} precisa ser entrada ou saída.`)
    }
  }

  return errors
}
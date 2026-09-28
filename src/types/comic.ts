export type AudioTrack = {
  id: string
  title: string
  src: string
}

export type PageCue = {
  page: number
  trackId: string
  action: 'start' | 'stop'
  fadeMs: number
}

export type ComicManifest = {
  id: string
  title: string
  subtitle: string
  description: string
  author: string
  pageCount: number
  pdf: string
  cover?: string
  tracks: AudioTrack[]
  cues: PageCue[]
}

export type Comic = Omit<ComicManifest, 'pdf' | 'cover' | 'tracks'> & {
  pdfUrl: string
  coverUrl?: string
  tracks: AudioTrack[]
}
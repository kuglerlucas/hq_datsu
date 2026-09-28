import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Maximize2,
  Pause,
  Play,
  X,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Document, Page } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import type { Comic } from '../../types/comic'
import { AudioController } from '../audio/AudioController'
import { activeTrackIdsForPage } from '../audio/pageCues'
import './pdfWorker'

type PdfReaderProps = {
  comic: Comic
  audioController?: AudioController
  onClose: () => void
  isPreview?: boolean
}

const MIN_READER_ZOOM = 0.7
const MAX_READER_ZOOM = 2.2
const READER_ZOOM_STEP = 0.1

function savedReaderZoom(comicId: string): number {
  try {
    const savedZoom = Number(window.localStorage.getItem(`datsu-reader-zoom:${comicId}`))
    if (Number.isFinite(savedZoom) && savedZoom >= MIN_READER_ZOOM && savedZoom <= MAX_READER_ZOOM) {
      return savedZoom
    }
  } catch {
    return 1
  }

  return 1
}

export function PdfReader({ comic, audioController: sharedAudioController, onClose, isPreview = false }: PdfReaderProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const audioController = useRef<AudioController | null>(null)
  const [pageCount, setPageCount] = useState(comic.pageCount)
  const [page, setPage] = useState(1)
  const [stageSize, setStageSize] = useState({ width: 760, height: 600 })
  const [pageAspectRatio, setPageAspectRatio] = useState(0.667)
  const [zoom, setZoom] = useState(() => savedReaderZoom(comic.id))
  const [pdfError, setPdfError] = useState('')
  const [documentLoaded, setDocumentLoaded] = useState(false)
  const [renderedPageKey, setRenderedPageKey] = useState('')
  const [audioActive, setAudioActive] = useState(comic.tracks.length > 0)
  const [audioBusy, setAudioBusy] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [volume, setVolume] = useState(58)

  const goToPage = useCallback((value: number, fromUserGesture = true) => {
    if (!Number.isFinite(value)) return
    const nextPage = Math.max(1, Math.min(pageCount || comic.pageCount, Math.round(value)))
    if (nextPage === page) return

    if (audioActive && audioController.current) {
      void audioController.current.playForPage(nextPage, comic.cues, fromUserGesture).catch((error: unknown) => {
        setAudioError(error instanceof Error ? error.message : 'Não foi possível reproduzir esta trilha.')
        setAudioActive(false)
      })
    }

    setPage(nextPage)
  }, [audioActive, comic.cues, comic.pageCount, page, pageCount])

  useEffect(() => {
    if (sharedAudioController) {
      audioController.current = sharedAudioController
      return () => {
        if (audioController.current === sharedAudioController) audioController.current = null
      }
    }

    const controller = new AudioController(comic.tracks)
    audioController.current = controller

    return () => {
      controller.dispose()
      audioController.current = null
    }
  }, [comic.id, comic.tracks, sharedAudioController])

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow
    const previousDocumentOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousDocumentOverflow
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(`datsu-reader-zoom:${comic.id}`, String(zoom))
    } catch {
      // Keep the current zoom if browser storage is unavailable.
    }
  }, [comic.id, zoom])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const updateStageSize = () => {
      const bounds = stage.getBoundingClientRect()
      setStageSize((current) => current.width === bounds.width && current.height === bounds.height
        ? current
        : { width: bounds.width, height: bounds.height })
    }

    updateStageSize()
    const observer = new ResizeObserver(updateStageSize)
    observer.observe(stage)
    window.addEventListener('resize', updateStageSize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateStageSize)
    }
  }, [])

  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [page])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goToPage(page + 1, true)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goToPage(page - 1, true)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToPage, onClose, page])

  const activeTrackIds = activeTrackIdsForPage(comic.cues, page)
  const activeTracks = comic.tracks.filter((track) => activeTrackIds.has(track.id))
  const activeTrackLabel = activeTracks.map((track) => track.title).join(' + ')
  const progress = pageCount > 0 ? (page / pageCount) * 100 : 0

  async function toggleAudio(): Promise<void> {
    const controller = audioController.current
    if (!controller || comic.tracks.length === 0) return

    if (audioActive) {
      controller.pause()
      setAudioActive(false)
      setAudioError('')
      return
    }

    setAudioBusy(true)
    setAudioError('')
    try {
      await controller.playForPage(page, comic.cues, true)
      setAudioActive(true)
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : 'Não foi possível reproduzir esta trilha.')
    } finally {
      setAudioBusy(false)
    }
  }

  function setAudioVolume(value: number): void {
    setVolume(value)
    audioController.current?.setVolume(value / 100)
  }

  const pageLabel = pageCount > 0 ? String(page).padStart(2, '0') : '--'
  const totalLabel = pageCount > 0 ? String(pageCount).padStart(2, '0') : '--'
  const fitPageWidth = Math.max(240, Math.min(
    stageSize.width - 32,
    (stageSize.height - 32) * pageAspectRatio,
    1280,
  ))
  const pageWidth = Math.floor(fitPageWidth * zoom)
  const renderKey = `${comic.id}:${page}:${pageWidth}`
  const zoomLabel = `${Math.round(zoom * 100)}%`
  const audioToggleLabel = audioActive
    ? activeTracks.length === 1 ? `Pausar ${activeTracks[0]!.title}` : 'Pausar trilhas automáticas'
    : 'Ativar trilhas sonoras'

  return (
    <div className="reader-page">
      <header className="reader-heading">
        <div className="reader-title-block">
          <button className="icon-button reader-close" onClick={onClose} aria-label="Fechar leitura" title="Fechar leitura">
            <X size={20} aria-hidden="true" />
          </button>
          <div className="reader-heading-copy">
            <span className="reader-header-kicker">{isPreview ? 'PRÉVIA LOCAL' : 'DATSU / HQ'}</span>
            <h1>{comic.title}</h1>
          </div>
        </div>
        <span className="reader-header-page"><span>{pageLabel}</span> / {totalLabel}</span>
      </header>

      {isPreview && <div className="preview-ribbon"><span />PRÉVIA NÃO PUBLICADA</div>}

      <section className="reader-layout">
        <div className="reader-center-column">
          <div className={`reader-stage${zoom > 1 ? ' reader-stage-zoomed' : ''}`} ref={stageRef}>
            {pdfError ? (
              <div className="reader-load-state reader-error" role="alert">
                <p>O PDF não pôde ser aberto.</p>
                <span>{pdfError}</span>
              </div>
            ) : (
              <Document
                className="reader-document"
                file={comic.pdfUrl}
                loading={<div className="reader-load-state"><LoaderCircle size={22} className="spin" /><span>ABRINDO PDF</span></div>}
                error={<div className="reader-load-state reader-error">O PDF não pôde ser aberto.</div>}
                onLoadSuccess={(document) => {
                  setPageCount(document.numPages)
                  setPage((current) => Math.min(current, document.numPages))
                  setPdfError('')
                  setDocumentLoaded(true)
                }}
                onLoadError={(error) => {
                  setPdfError(error.message)
                  setDocumentLoaded(false)
                }}
              >
                <Page
                  className="reader-pdf-page"
                  pageNumber={page}
                  width={pageWidth}
                  onLoadSuccess={(pdfPage) => {
                    const viewport = pdfPage.getViewport({ scale: 1 })
                    const ratio = viewport.width / viewport.height
                    setPageAspectRatio((current) => Math.abs(current - ratio) < 0.001 ? current : ratio)
                  }}
                  onRenderSuccess={() => setRenderedPageKey(renderKey)}
                  onRenderError={(error) => {
                    setPdfError(error.message)
                    setRenderedPageKey('')
                  }}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={<div className="reader-load-state"><LoaderCircle size={22} className="spin" /><span>RENDERIZANDO PÁGINA</span></div>}
                />
              </Document>
            )}
            {!pdfError && documentLoaded && renderedPageKey !== renderKey && (
              <div className="reader-render-state" role="status" aria-live="polite">
                <span className="reader-render-signal" aria-hidden="true"><i /><i /><i /></span>
                <span>PÁGINA {pageLabel} / REVELANDO</span>
              </div>
            )}
          </div>

          <div className="reader-page-controls">
            <button className="icon-button" onClick={() => goToPage(page - 1)} disabled={page <= 1} aria-label="Página anterior" title="Página anterior">
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <div className="page-number-control">
              <label htmlFor="reader-page-number">PÁGINA</label>
              <input
                id="reader-page-number"
                type="number"
                min={1}
                max={pageCount || comic.pageCount}
                value={page}
                onChange={(event) => goToPage(Number(event.target.value))}
                aria-label="Número da página"
              />
              <span>/ {totalLabel}</span>
            </div>
            <button className="icon-button" onClick={() => goToPage(page + 1)} disabled={pageCount > 0 && page >= pageCount} aria-label="Próxima página" title="Próxima página">
              <ChevronRight size={20} aria-hidden="true" />
            </button>
            <div className="page-progress" aria-label={`Progresso de leitura: ${page} de ${pageCount} páginas`}>
              <div className="page-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="reader-zoom-controls" aria-label="Zoom da página">
              <button
                className="icon-button icon-button-small"
                onClick={() => setZoom((current) => Math.max(MIN_READER_ZOOM, Math.round((current - READER_ZOOM_STEP) * 10) / 10))}
                disabled={zoom <= MIN_READER_ZOOM}
                aria-label="Diminuir zoom"
                title="Diminuir zoom"
              >
                <ZoomOut size={16} aria-hidden="true" />
              </button>
              <button className="reader-zoom-reset" onClick={() => setZoom(1)} aria-label="Ajustar página à tela" title="Ajustar página à tela">
                <Maximize2 size={13} aria-hidden="true" />
                <span>{zoomLabel}</span>
              </button>
              <button
                className="icon-button icon-button-small"
                onClick={() => setZoom((current) => Math.min(MAX_READER_ZOOM, Math.round((current + READER_ZOOM_STEP) * 10) / 10))}
                disabled={zoom >= MAX_READER_ZOOM}
                aria-label="Aumentar zoom"
                title="Aumentar zoom"
              >
                <ZoomIn size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="reader-audio-bar">
            <div className="audio-bar-identity">
              <span className={`audio-orbit ${audioActive ? 'audio-orbit-active' : ''}`}><AudioLines size={17} aria-hidden="true" /></span>
              <div>
                <span className="audio-bar-label">TRILHA DA PÁGINA {pageLabel}</span>
                <strong>{activeTrackLabel || 'Sem trilha nesta página'}</strong>
              </div>
            </div>
            <div className="audio-bar-controls">
              <button
                className={`audio-toggle ${audioActive ? 'audio-toggle-active' : ''}`}
                onClick={() => void toggleAudio()}
                disabled={comic.tracks.length === 0 || audioBusy}
                aria-label={audioToggleLabel}
                title={audioToggleLabel}
              >
                {audioBusy ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : audioActive ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
              </button>
              <label className="volume-control">
                {volume === 0 ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(event) => setAudioVolume(Number(event.target.value))}
                  disabled={comic.tracks.length === 0}
                  aria-label="Volume da trilha sonora"
                />
              </label>
            </div>
          </div>
          {(audioError || (comic.tracks.length > 0 && !audioActive && activeTracks.length === 0)) && (
            <p className="reader-audio-note" role="status">
              {audioError || 'Trilhas pausadas'}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
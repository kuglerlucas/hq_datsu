import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Archive, ArrowLeft, BookPlus, Headphones, Signal } from 'lucide-react'
import { loadComicCatalog } from './data/catalog'
import { AudioController } from './features/audio/AudioController'
import { ComicLibrary } from './features/library/ComicLibrary'
import type { Comic } from './types/comic'

const PdfReader = lazy(() => import('./features/reader/PdfReader').then((module) => ({ default: module.PdfReader })))
const ComicPublisher = lazy(() => import('./features/publisher/ComicPublisher').then((module) => ({ default: module.ComicPublisher })))

type AppRoute =
  | { kind: 'library' }
  | { kind: 'publisher' }
  | { kind: 'reader'; comicId: string }
  | { kind: 'preview' }

type CatalogState = 'loading' | 'ready' | 'error'
type ReaderAudioSession = { comicId: string; controller: AudioController }

function routeFromHash(hash: string): AppRoute {
  const path = decodeURIComponent(hash.replace(/^#/, '') || '/')
  if (path === '/publish' && import.meta.env.DEV) return { kind: 'publisher' }

  const match = path.match(/^\/comic\/([^/]+)$/)
  if (match?.[1]) return { kind: 'reader', comicId: match[1] }
  return { kind: 'library' }
}

function routeHash(route: AppRoute): string {
  if (route.kind === 'publisher') return '#/publish'
  if (route.kind === 'reader') return `#/comic/${encodeURIComponent(route.comicId)}`
  if (route.kind === 'preview') return '#/'
  return '#/'
}

function App() {
  const [route, setRoute] = useState<AppRoute>(() => routeFromHash(window.location.hash))
  const [catalogState, setCatalogState] = useState<CatalogState>('loading')
  const [catalogError, setCatalogError] = useState('')
  const [comics, setComics] = useState<Comic[]>([])
  const [reloadVersion, setReloadVersion] = useState(0)
  const [previewComic, setPreviewComic] = useState<Comic | null>(null)
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [readerAudioSession, setReaderAudioSession] = useState<ReaderAudioSession | null>(null)
  const readerAudioSessionRef = useRef<ReaderAudioSession | null>(null)

  useEffect(() => {
    let active = true

    loadComicCatalog()
      .then((loadedComics) => {
        if (!active) return
        const currentRoute = routeFromHash(window.location.hash)
        if (currentRoute.kind === 'reader') {
          const comic = loadedComics.find((entry) => entry.id === currentRoute.comicId)
          const currentSession = readerAudioSessionRef.current
          if (comic && currentSession?.comicId !== comic.id) {
            currentSession?.controller.dispose()
            const session = { comicId: comic.id, controller: new AudioController(comic.tracks) }
            readerAudioSessionRef.current = session
            setReaderAudioSession(session)
          }
        }
        setComics(loadedComics)
        setCatalogError('')
        setCatalogState('ready')
      })
      .catch((error: unknown) => {
        if (!active) return
        setCatalogError(error instanceof Error ? error.message : 'Erro desconhecido.')
        setCatalogState('error')
      })

    return () => {
      active = false
    }
  }, [reloadVersion])

  useEffect(() => {
    const handleHashChange = () => {
      const nextRoute = routeFromHash(window.location.hash)
      const audioSession = readerAudioSessionRef.current
      if (audioSession && (nextRoute.kind !== 'reader' || nextRoute.comicId !== audioSession.comicId)) {
        audioSession.controller.dispose()
        readerAudioSessionRef.current = null
        setReaderAudioSession(null)
      }
      setRoute(nextRoute)
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => () => previewUrls.forEach((url) => URL.revokeObjectURL(url)), [previewUrls])

  useEffect(() => () => readerAudioSessionRef.current?.controller.dispose(), [])

  function navigate(nextRoute: AppRoute): void {
    const audioSession = readerAudioSessionRef.current
    if (audioSession && (nextRoute.kind !== 'reader' || nextRoute.comicId !== audioSession.comicId)) {
      audioSession.controller.dispose()
      readerAudioSessionRef.current = null
      setReaderAudioSession(null)
    }

    const nextHash = routeHash(nextRoute)
    if (window.location.hash === nextHash) {
      setRoute(nextRoute)
      return
    }
    window.location.hash = nextHash
  }

  function openPreview(comic: Comic, urls: string[]): void {
    const audioSession = readerAudioSessionRef.current
    audioSession?.controller.dispose()
    const controller = new AudioController(comic.tracks)
    controller.unlockFromGesture()
    const nextAudioSession = { comicId: comic.id, controller }
    readerAudioSessionRef.current = nextAudioSession
    setReaderAudioSession(nextAudioSession)
    setPreviewComic(comic)
    setPreviewUrls(urls)
    setRoute({ kind: 'preview' })
  }

  function closePreview(): void {
    const audioSession = readerAudioSessionRef.current
    audioSession?.controller.dispose()
    readerAudioSessionRef.current = null
    setReaderAudioSession(null)
    setPreviewComic(null)
    setPreviewUrls([])
    navigate({ kind: 'library' })
  }

  function openComic(comic: Comic): void {
    readerAudioSessionRef.current?.controller.dispose()
    const controller = new AudioController(comic.tracks)
    controller.unlockFromGesture()
    const audioSession = { comicId: comic.id, controller }
    readerAudioSessionRef.current = audioSession
    setReaderAudioSession(audioSession)
    navigate({ kind: 'reader', comicId: comic.id })
  }

  function reloadCatalog(): void {
    setCatalogState('loading')
    setReloadVersion((version) => version + 1)
  }

  const selectedComic = route.kind === 'reader'
    ? comics.find((comic) => comic.id === route.comicId) ?? null
    : route.kind === 'preview'
      ? previewComic
      : null
  const selectedAudioController = selectedComic && readerAudioSession?.comicId === selectedComic.id
    ? readerAudioSession.controller
    : undefined
  const readerOpen = route.kind === 'reader' || route.kind === 'preview'
  const currentSection = route.kind === 'publisher' ? 'PUBLICADOR' : readerOpen ? 'LEITOR' : 'ACERVO'

  return (
    <div className="site-shell">
      <aside className="sidebar">
        <a className="brand-lockup" href="#/" onClick={(event) => { event.preventDefault(); navigate({ kind: 'library' }) }}>
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span className="brand-word">DATSU</span>
          <span className="brand-version">HQ / 01</span>
        </a>

        <div className="sidebar-caption">
          <span className="eyebrow">ARQUIVO PARTICULAR</span>
          <p>Leituras de Datsu</p>
        </div>

        <nav className="primary-nav" aria-label="Navegação principal">
          <button
            className={`nav-item ${!readerOpen && route.kind !== 'publisher' ? 'nav-item-active' : ''}`}
            onClick={() => navigate({ kind: 'library' })}
          >
            <Archive size={18} aria-hidden="true" />
            <span>Acervo</span>
            <span className="nav-count">{String(comics.length).padStart(2, '0')}</span>
          </button>
          {import.meta.env.DEV && (
            <button
              className={`nav-item ${route.kind === 'publisher' ? 'nav-item-active' : ''}`}
              onClick={() => navigate({ kind: 'publisher' })}
            >
              <BookPlus size={18} aria-hidden="true" />
              <span>Preparar HQ</span>
            </button>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-signal">
            <Signal size={15} aria-hidden="true" />
            <span>ARQUIVO DISPONÍVEL</span>
          </div>
          <div className="sidebar-audio-note">
            <Headphones size={15} aria-hidden="true" />
            <span>ÁUDIO SOB ESCOLHA</span>
          </div>
          <p className="sidebar-footnote">CONTEÚDO PÚBLICO APÓS DEPLOY</p>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-breadcrumb">
            <span>DATSU</span>
            <span className="breadcrumb-divider">/</span>
            <span>{currentSection}</span>
          </div>
          <div className="topbar-status">
            <span className="status-dot" />
            <span>ARQUIVO ESTÁTICO</span>
          </div>
        </header>

        <main className="main-content">
          {route.kind === 'publisher' && import.meta.env.DEV ? (
            <Suspense fallback={<div className="route-state"><span className="loading-mark" /><p>Abrindo ferramentas locais...</p></div>}>
              <ComicPublisher
                onCancel={() => navigate({ kind: 'library' })}
                onPreview={openPreview}
              />
            </Suspense>
          ) : readerOpen ? (
            selectedComic ? (
              <Suspense fallback={<div className="route-state"><span className="loading-mark" /><p>Preparando leitor...</p></div>}>
                <PdfReader key={selectedComic.id} comic={selectedComic} audioController={selectedAudioController} onClose={route.kind === 'preview' ? closePreview : () => navigate({ kind: 'library' })} isPreview={route.kind === 'preview'} />
              </Suspense>
            ) : catalogState === 'loading' && route.kind === 'reader' ? (
              <div className="route-state" aria-live="polite"><span className="loading-mark" /><p>Consultando o arquivo...</p></div>
            ) : (
              <section className="route-state route-not-found">
                <p className="eyebrow"><span className="eyebrow-line" />REFERÊNCIA NÃO ENCONTRADA</p>
                <h1>Esta HQ não está no acervo.</h1>
                <button className="button-secondary" onClick={() => navigate({ kind: 'library' })}>
                  <ArrowLeft size={16} aria-hidden="true" />
                  Voltar ao acervo
                </button>
              </section>
            )
          ) : (
            <ComicLibrary
              comics={comics}
              catalogState={catalogState}
              catalogError={catalogError}
              authoringEnabled={import.meta.env.DEV}
              onOpenComic={openComic}
              onPublish={() => navigate({ kind: 'publisher' })}
              onReload={reloadCatalog}
            />
          )}
        </main>
      </div>
    </div>
  )
}

export default App

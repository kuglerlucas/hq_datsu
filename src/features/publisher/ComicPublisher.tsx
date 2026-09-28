import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  Download,
  FileText,
  ImagePlus,
  LoaderCircle,
  Music2,
  Play,
  Plus,
  Trash2,
} from 'lucide-react'
import { validatePageCues } from '../audio/pageCues'
import { pdfjs } from '../reader/pdfWorker'
import type { Comic, PageCue } from '../../types/comic'
import {
  comicSlug,
  createComicBundle,
  createComicPreview,
  MAX_ASSET_BYTES,
  validateComicDraft,
  type ComicDraft,
  type DraftTrack,
} from './exportComicBundle'

type CueRow = PageCue & { key: string }

type ComicPublisherProps = {
  onCancel: () => void
  onPreview: (comic: Comic, urls: string[]) => void
}

function localId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readableSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function trackTitle(filename: string): string {
  return filename.replace(/\.mp3$/i, '').replace(/[_-]+/g, ' ').trim()
}

export function ComicPublisher({ onCancel, onPreview }: ComicPublisherProps) {
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [description, setDescription] = useState('')
  const [author, setAuthor] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [pdfReading, setPdfReading] = useState(false)
  const [tracks, setTracks] = useState<DraftTrack[]>([])
  const [cues, setCues] = useState<CueRow[]>([])
  const [showValidation, setShowValidation] = useState(false)
  const [fileMessage, setFileMessage] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [exporting, setExporting] = useState(false)
  const pdfRequest = useRef(0)
  const bundleUrls = useRef<string[]>([])

  const draft: ComicDraft = {
    title,
    subtitle,
    description,
    author,
    pageCount,
    pdfFile,
    coverFile,
    tracks,
    cues: cues.map(({ page, trackId, action, fadeMs }) => ({ page, trackId, action, fadeMs })),
  }
  const validationErrors = validateComicDraft(draft)
  const cueErrors = pageCount > 0
    ? validatePageCues(draft.cues, pageCount, tracks.map((track) => track.id))
    : []
  const orderedCues = [...cues].sort((first, second) => first.page - second.page || first.trackId.localeCompare(second.trackId))
  const draftSignature = JSON.stringify({
    title,
    subtitle,
    description,
    author,
    pageCount,
    pdf: pdfFile ? [pdfFile.name, pdfFile.size, pdfFile.lastModified] : null,
    cover: coverFile ? [coverFile.name, coverFile.size, coverFile.lastModified] : null,
    tracks: tracks.map((track) => [track.id, track.title, track.file.name, track.file.size, track.file.lastModified]),
    cues: draft.cues,
  })

  const [bundle, setBundle] = useState<{ url: string; filename: string; signature: string } | null>(null)

  useEffect(() => () => bundleUrls.current.forEach((url) => URL.revokeObjectURL(url)), [])

  async function selectPdf(file: File | null): Promise<void> {
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setFileMessage('O arquivo principal precisa ser PDF.')
      return
    }
    if (file.size > MAX_ASSET_BYTES) {
      setFileMessage('O PDF ultrapassa o limite de 95 MiB por arquivo.')
      return
    }

    const requestId = ++pdfRequest.current
    setFileMessage('')
    setActionMessage('')
    setPdfFile(file)
    setPageCount(0)
    setPdfReading(true)

    try {
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
      const document = await loadingTask.promise
      const pages = document.numPages
      await loadingTask.destroy()

      if (requestId === pdfRequest.current) setPageCount(pages)
    } catch {
      if (requestId === pdfRequest.current) {
        setFileMessage('Este PDF não pôde ser lido. Confira se o arquivo está íntegro.')
        setPageCount(0)
      }
    } finally {
      if (requestId === pdfRequest.current) setPdfReading(false)
    }
  }

  function addAudioFiles(files: File[]): void {
    const accepted: DraftTrack[] = []
    const rejected: string[] = []

    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.mp3')) {
        rejected.push(`${file.name}: use MP3.`)
      } else if (file.size > MAX_ASSET_BYTES) {
        rejected.push(`${file.name}: ultrapassa 95 MiB.`)
      } else {
        accepted.push({ id: localId('track'), title: trackTitle(file.name), file })
      }
    }

    if (accepted.length > 0) {
      const firstNewTrack = accepted[0]!
      setTracks((current) => [...current, ...accepted])
      setCues((current) => current.length === 0
        ? [{ key: localId('cue'), page: 1, trackId: firstNewTrack.id, action: 'start', fadeMs: 1200 }]
        : current)
    }

    setFileMessage(rejected.join(' '))
    setActionMessage('')
  }

  function removeTrack(trackId: string): void {
    setTracks((current) => current.filter((track) => track.id !== trackId))
    setCues((current) => current.filter((cue) => cue.trackId !== trackId))
  }

  function addCue(): void {
    if (pageCount < 1) {
      setFileMessage('Adicione um PDF antes de criar marcações.')
      return
    }
    if (tracks.length === 0) {
      setFileMessage('Adicione ao menos uma faixa antes de criar marcações.')
      return
    }

    const trackId = tracks[0]!.id
    const occupiedPages = new Set(cues.filter((cue) => cue.trackId === trackId).map((cue) => cue.page))
    let page = 1
    while (occupiedPages.has(page) && page <= pageCount) page += 1
    if (page > pageCount) {
      setFileMessage('Cada página já possui uma marcação.')
      return
    }

    setFileMessage('')
    setCues((current) => [...current, {
      key: localId('cue'),
      page,
      trackId,
      action: 'start',
      fadeMs: 1200,
    }])
  }

  function updateCue(key: string, patch: Partial<PageCue>): void {
    setCues((current) => current.map((cue) => cue.key === key ? { ...cue, ...patch } : cue))
    setActionMessage('')
  }

  function createPreview(): void {
    setShowValidation(true)
    if (validationErrors.length > 0) return

    try {
      const preview = createComicPreview(draft)
      onPreview(preview.comic, preview.urls)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Não foi possível abrir a prévia.')
    }
  }

  async function downloadBundle(): Promise<void> {
    setShowValidation(true)
    setActionMessage('')
    if (validationErrors.length > 0) return

    setExporting(true)
    try {
      const archive = await createComicBundle(draft)
      const copy = archive.slice()
      const blob = new Blob([copy.buffer], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      for (const previousUrl of bundleUrls.current) URL.revokeObjectURL(previousUrl)
      bundleUrls.current = [url]
      setBundle({ url, filename: `${comicSlug(title)}-publicacao.zip`, signature: draftSignature })
      setActionMessage('Pacote pronto para baixar.')
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Não foi possível criar o pacote.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="publisher-page">
      <header className="publisher-heading">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" />ESTAÇÃO DE PUBLICAÇÃO / LOCAL</p>
          <h1>Preparar HQ</h1>
          <p className="page-intro">Uma edição, suas páginas e as trilhas que as acompanham.</p>
        </div>
        <button className="button-secondary" onClick={onCancel}>
          <ArrowLeft size={16} aria-hidden="true" />
          Voltar ao acervo
        </button>
      </header>

      <div className="publisher-notice" role="note">
        <span className="notice-symbol" aria-hidden="true">i</span>
        <p>Os arquivos ficam neste navegador até você baixar o pacote. Depois do deploy, PDF e áudio serão públicos.</p>
      </div>

      <div className="publisher-layout">
        <div className="publisher-main-column">
          <section className="publisher-section">
            <div className="publisher-section-heading">
              <span className="section-number">01</span>
              <div>
                <h2>Identificação</h2>
                <p>Dados que aparecem no acervo.</p>
              </div>
            </div>
            <div className="publisher-fields">
              <label className="form-field form-field-wide">
                <span>Título <b>*</b></span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="Título da HQ" />
              </label>
              <label className="form-field">
                <span>Subtítulo</span>
                <input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} maxLength={120} placeholder="Volume, capítulo ou arco" />
              </label>
              <label className="form-field">
                <span>Autoria</span>
                <input value={author} onChange={(event) => setAuthor(event.target.value)} maxLength={100} placeholder="Nome ou equipe" />
              </label>
              <label className="form-field form-field-wide">
                <span>Descrição</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={360} rows={3} placeholder="Uma nota curta sobre esta edição" />
              </label>
            </div>
          </section>

          <section className="publisher-section">
            <div className="publisher-section-heading">
              <span className="section-number">02</span>
              <div>
                <h2>Arquivos da edição</h2>
                <p>PDF para as páginas e, se desejar, uma imagem de capa.</p>
              </div>
            </div>

            <div className="asset-picker-grid">
              <div className="asset-picker-block">
                <label className="upload-zone upload-zone-primary">
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event) => {
                      void selectPdf(event.currentTarget.files?.[0] ?? null)
                      event.currentTarget.value = ''
                    }}
                  />
                  <span className="upload-zone-icon"><FileText size={21} aria-hidden="true" /></span>
                  <span className="upload-zone-copy">
                    <strong>{pdfFile ? 'Substituir PDF' : 'Escolher PDF'}</strong>
                    <small>PDF · até 95 MiB</small>
                  </span>
                </label>
                {pdfFile && (
                  <div className="selected-asset">
                    <span className="asset-file-name">{pdfFile.name}</span>
                    <span>{pdfReading ? 'LENDO...' : pageCount ? `${pageCount} páginas · ${readableSize(pdfFile.size)}` : 'NÃO FOI POSSÍVEL LER'}</span>
                    {pdfReading && <LoaderCircle size={15} className="spin" aria-label="Lendo PDF" />}
                  </div>
                )}
              </div>

              <div className="asset-picker-block">
                <label className="upload-zone">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] ?? null
                      setCoverFile(file)
                      setFileMessage('')
                      event.currentTarget.value = ''
                    }}
                  />
                  <span className="upload-zone-icon"><ImagePlus size={20} aria-hidden="true" /></span>
                  <span className="upload-zone-copy">
                    <strong>{coverFile ? 'Substituir capa' : 'Capa opcional'}</strong>
                    <small>JPG, PNG ou WebP</small>
                  </span>
                </label>
                {coverFile && (
                  <div className="selected-asset">
                    <span className="asset-file-name">{coverFile.name}</span>
                    <span>{readableSize(coverFile.size)}</span>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="publisher-section">
            <div className="publisher-section-heading">
              <span className="section-number">03</span>
              <div>
                <h2>Trilhas</h2>
                <p>Faixas MP3; a leitura também funciona sem áudio.</p>
              </div>
            </div>

            <label className="upload-zone audio-upload-zone">
              <input
                type="file"
                accept="audio/mpeg,.mp3"
                multiple
                onChange={(event) => {
                  addAudioFiles(Array.from(event.currentTarget.files ?? []))
                  event.currentTarget.value = ''
                }}
              />
              <span className="upload-zone-icon"><Music2 size={20} aria-hidden="true" /></span>
              <span className="upload-zone-copy">
                <strong>Adicionar faixas MP3</strong>
                <small>Selecione uma ou várias · até 95 MiB cada</small>
              </span>
              <Plus size={18} className="upload-zone-end-icon" aria-hidden="true" />
            </label>

            {tracks.length > 0 && (
              <ul className="track-list" aria-label="Faixas adicionadas">
                {tracks.map((track, index) => (
                  <li className="track-row" key={track.id}>
                    <span className="track-index">{String(index + 1).padStart(2, '0')}</span>
                    <Music2 size={16} aria-hidden="true" />
                    <span className="track-title">{track.title}</span>
                    <span className="track-size">{readableSize(track.file.size)}</span>
                    <button className="icon-button icon-button-small" onClick={() => removeTrack(track.id)} aria-label={`Remover ${track.title}`} title="Remover faixa">
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="cue-column">
          <section className="cue-panel">
            <div className="cue-panel-heading">
              <span className="section-number">04</span>
              <div>
                <p className="eyebrow">MAPA SONORO</p>
                <h2>Entradas e saídas</h2>
              </div>
            </div>
            <p className="cue-explainer">Cada faixa tem suas próprias entradas e saídas. Você pode sobrepor trilhas na mesma página; saltos aplicam o estado sonoro da página de destino.</p>

            {orderedCues.length === 0 ? (
              <div className="cue-empty">Nenhuma marcação de trilha. Adicione uma entrada quando as páginas e músicas estiverem definidas.</div>
            ) : (
              <div className="cue-list">
                {orderedCues.map((cue) => (
                  <div className="cue-row" key={cue.key}>
                    <label className="cue-control cue-page-control">
                      <span>PÁGINA</span>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(pageCount, 1)}
                        value={cue.page}
                        onChange={(event) => updateCue(cue.key, { page: Number(event.target.value) })}
                        aria-label={`Página da marcação ${cue.page}`}
                      />
                    </label>
                    <label className="cue-control cue-track-control">
                      <span>TRILHA</span>
                      <select
                        value={cue.trackId}
                        onChange={(event) => updateCue(cue.key, { trackId: event.target.value })}
                        aria-label={`Faixa da marcação na página ${cue.page}`}
                      >
                        {tracks.map((track) => <option value={track.id} key={track.id}>{track.title}</option>)}
                      </select>
                    </label>
                    <label className="cue-control cue-action-control">
                      <span>AÇÃO</span>
                      <select
                        value={cue.action}
                        onChange={(event) => updateCue(cue.key, { action: event.target.value as PageCue['action'] })}
                        aria-label={`Ação da faixa na página ${cue.page}`}
                      >
                        <option value="start">Entrar</option>
                        <option value="stop">Sair</option>
                      </select>
                    </label>
                    <label className="cue-control cue-fade-control">
                      <span>FADE · s</span>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        step={0.5}
                        value={cue.fadeMs / 1000}
                        onChange={(event) => updateCue(cue.key, { fadeMs: Math.round(Number(event.target.value) * 1000) })}
                        aria-label={`Duração do fade na página ${cue.page}, em segundos`}
                      />
                    </label>
                    <button className="icon-button icon-button-small cue-remove" onClick={() => setCues((current) => current.filter((entry) => entry.key !== cue.key))} aria-label={`Remover marcação da página ${cue.page}`} title="Remover marcação">
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button className="button-secondary cue-add-button" onClick={addCue} disabled={pageCount < 1 || tracks.length === 0}>
              <Plus size={16} aria-hidden="true" />
              Adicionar marcação
            </button>

            {cueErrors.length > 0 && showValidation && (
              <ul className="validation-list" role="alert">
                {cueErrors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            )}
          </section>

          <div className="publisher-actions">
            {showValidation && validationErrors.length > 0 && (
              <ul className="validation-list" role="alert">
                {validationErrors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            )}
            {fileMessage && <p className="form-message form-message-error" role="status">{fileMessage}</p>}
            {actionMessage && <p className="form-message" role="status"><Check size={15} aria-hidden="true" />{actionMessage}</p>}
            <button className="button-secondary publisher-preview-button" onClick={createPreview} disabled={validationErrors.length > 0 || pdfReading}>
              <Play size={16} aria-hidden="true" />
              Pré-visualizar
            </button>
            {bundle?.signature === draftSignature ? (
              <a className="button-primary publisher-export-button" href={bundle.url} download={bundle.filename}>
                <Download size={16} aria-hidden="true" />
                <span>Baixar pacote ZIP</span>
              </a>
            ) : (
              <button className="button-primary publisher-export-button" onClick={() => void downloadBundle()} disabled={exporting || pdfReading}>
                {exporting ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                <span>Gerar pacote ZIP</span>
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
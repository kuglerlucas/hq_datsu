import { ArrowUpRight, BookOpen, Plus, RotateCw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Comic } from '../../types/comic'

type CatalogState = 'loading' | 'ready' | 'error'

type ComicLibraryProps = {
  comics: Comic[]
  catalogState: CatalogState
  catalogError?: string
  authoringEnabled: boolean
  onOpenComic: (comic: Comic) => void
  onPublish: () => void
  onReload: () => void
}

function ComicCard({ comic, index, onOpen }: { comic: Comic; index: number; onOpen: () => void }) {
  return (
    <article className="comic-card" style={{ animationDelay: `${index * 55}ms` }}>
      <button className="comic-cover-button" onClick={onOpen} aria-label={`Ler ${comic.title}`}>
        {comic.coverUrl ? (
          <img className="comic-cover-image" src={comic.coverUrl} alt={`Capa de ${comic.title}`} />
        ) : (
          <div className={`cover-composition cover-composition-${index % 4}`}>
            <span className="cover-edition">DATSU / {String(index + 1).padStart(2, '0')}</span>
            <span className="cover-sigil" aria-hidden="true">D</span>
            <strong>{comic.title}</strong>
            <span className="cover-subtitle">{comic.subtitle || 'Edição digital'}</span>
          </div>
        )}
        <span className="cover-open-icon" aria-hidden="true"><ArrowUpRight size={18} /></span>
      </button>
      <div className="comic-card-copy">
        <div className="comic-card-title-row">
          <h3>{comic.title}</h3>
          <span className="comic-card-index">{String(index + 1).padStart(2, '0')}</span>
        </div>
        <p>{comic.subtitle || comic.description || 'HQ do arquivo Datsu'}</p>
        <div className="comic-card-meta">
          <span>{comic.pageCount} páginas</span>
          <span aria-hidden="true">/</span>
          <span>{comic.tracks.length} {comic.tracks.length === 1 ? 'faixa' : 'faixas'}</span>
        </div>
      </div>
    </article>
  )
}

export function ComicLibrary({
  comics,
  catalogState,
  catalogError,
  authoringEnabled,
  onOpenComic,
  onPublish,
  onReload,
}: ComicLibraryProps) {
  const [query, setQuery] = useState('')
  const filteredComics = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR')
    if (!term) return comics

    return comics.filter((comic) =>
      [comic.title, comic.subtitle, comic.description, comic.author]
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(term),
    )
  }, [comics, query])

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow"><span className="eyebrow-line" />ARQUIVO DE LEITURA / DATSU</p>
          <h1>Acervo</h1>
          <p className="page-intro">Histórias guardadas para serem abertas no próprio ritmo.</p>
        </div>
        <div className="edition-count" aria-label={`${comics.length} HQs no acervo`}>
          <span className="count-value">{String(comics.length).padStart(2, '0')}</span>
          <span className="count-label">EDIÇÕES<br />NO ARQUIVO</span>
        </div>
      </section>

      <div className="library-toolbar">
        <label className="search-field">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar no acervo"
            aria-label="Buscar HQs"
          />
        </label>
        <div className="toolbar-actions">
          <span className="catalog-status">
            <span className={`status-dot ${catalogState === 'error' ? 'status-dot-error' : ''}`} />
            {catalogState === 'loading' ? 'LENDO CATÁLOGO' : catalogState === 'error' ? 'CATÁLOGO INDISPONÍVEL' : 'ARQUIVO PÚBLICO'}
          </span>
          {authoringEnabled && (
            <button className="button-primary" onClick={onPublish}>
              <Plus size={17} aria-hidden="true" />
              <span>Preparar HQ</span>
            </button>
          )}
        </div>
      </div>

      {catalogState === 'error' ? (
        <section className="catalog-error" role="alert">
          <div className="error-mark">!</div>
          <div>
            <h2>O catálogo não pôde ser lido.</h2>
            <p>{catalogError || 'Confira o arquivo público do acervo e tente novamente.'}</p>
          </div>
          <button className="button-secondary" onClick={onReload}>
            <RotateCw size={16} aria-hidden="true" />
            Tentar novamente
          </button>
        </section>
      ) : catalogState === 'loading' ? (
        <section className="library-loading" aria-live="polite">
          <span className="loading-mark" />
          <p>Consultando o arquivo...</p>
        </section>
      ) : comics.length === 0 ? (
        <section className="empty-stage">
          <div className="empty-copy">
            {authoringEnabled ? (
              <>
                <p className="eyebrow"><span className="eyebrow-line" />PRIMEIRA ENTRADA / PENDENTE</p>
                <h2>Uma história<br />muda o arquivo.</h2>
                <p className="empty-description">
                  Prepare o PDF, escolha as faixas e marque as páginas em que a trilha deve mudar.
                  A publicação acontece depois, em um pacote que você controla.
                </p>
                <button className="button-primary button-primary-large" onClick={onPublish}>
                  <Plus size={18} aria-hidden="true" />
                  <span>Adicionar a primeira HQ</span>
                </button>
                <div className="empty-footnote">
                  <BookOpen size={15} aria-hidden="true" />
                  <span>PDF para leitura · MP3 para trilhas · acesso público após publicação</span>
                </div>
              </>
            ) : (
              <>
                <p className="eyebrow"><span className="eyebrow-line" />ARQUIVO / AGUARDANDO EDIÇÃO</p>
                <h2>As histórias<br />chegam em breve.</h2>
                <p className="empty-description">
                  O acervo ainda não tem HQs publicadas. Quando uma edição entrar no arquivo,
                  ela poderá ser lida por aqui.
                </p>
              </>
            )}
          </div>

          <figure className="reference-figure">
            <div className="reference-frame">
              <img
                src={`${import.meta.env.BASE_URL}images/carina-cosmic-cliffs.jpg`}
                alt="Formações de gás e poeira iluminadas na nebulosa Carina, imagem de referência temporária."
              />
              <span className="reference-label">REFERÊNCIA VISUAL / TEMPORÁRIA</span>
              <span className="reference-coordinate">CAMPO 01 · CARINA</span>
            </div>
            <figcaption>
              <span>Imagem provisória; não representa o cânone de Datsu.</span>
              <span className="image-credit">NASA / ESA / CSA / STScI</span>
            </figcaption>
          </figure>
        </section>
      ) : filteredComics.length === 0 ? (
        <section className="no-search-results">
          <p>Nenhuma HQ corresponde a “{query}”.</p>
          <button className="text-button" onClick={() => setQuery('')}>Limpar busca</button>
        </section>
      ) : (
        <section className="comic-grid" aria-label="HQs no acervo">
          {filteredComics.map((comic, index) => (
            <ComicCard key={comic.id} comic={comic} index={index} onOpen={() => onOpenComic(comic)} />
          ))}
        </section>
      )}
    </>
  )
}
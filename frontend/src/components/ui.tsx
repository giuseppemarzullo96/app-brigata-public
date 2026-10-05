import { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * I pezzi condivisi dell'interfaccia.
 *
 * Stavano scritti a mano dentro ogni pagina, con misure e colori leggermente
 * diversi ogni volta: sei varianti di scheda, tre di stato vuoto, quattro
 * tonalità di grigio per lo stesso testo secondario. Qui ci sono una volta
 * sola, e una modifica arriva dappertutto.
 *
 * Le regole che incorporano:
 * - ogni bersaglio toccabile è almeno 44×44, la misura sotto la quale un dito
 *   sbaglia;
 * - l'azione principale, sul telefono, sta in fondo allo schermo dove il
 *   pollice arriva; su schermo largo torna in alto, dove il mouse la cerca;
 * - lo stato non è mai affidato al solo colore: accanto c'è sempre una parola
 *   o un numero.
 */

/* ---------------------------------------------------------------- testate */

export function IntestazionePagina({
  titolo,
  azioni,
  sottotitolo,
}: {
  titolo: string
  azioni?: ReactNode
  sottotitolo?: string
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900 lg:text-3xl">{titolo}</h1>
        {sottotitolo && <p className="mt-1 text-sm text-gray-500">{sottotitolo}</p>}
      </div>
      {azioni}
    </div>
  )
}

/** Pulsante con la sola icona: serve l'etichetta, altrimenti è muto. */
export function BottoneIcona({
  etichetta,
  onClick,
  to,
  children,
}: {
  etichetta: string
  onClick?: () => void
  to?: string
  children: ReactNode
}) {
  const classi =
    'flex h-11 w-11 flex-none items-center justify-center rounded-xl text-gray-700 transition hover:bg-gray-100'
  if (to) {
    return (
      <Link to={to} aria-label={etichetta} title={etichetta} className={classi}>
        {children}
      </Link>
    )
  }
  return (
    <button type="button" aria-label={etichetta} title={etichetta} onClick={onClick} className={classi}>
      {children}
    </button>
  )
}

/* -------------------------------------------------------------- linguette */

export function Linguette<T extends string>({
  valore,
  onChange,
  voci,
}: {
  valore: T
  onChange: (v: T) => void
  voci: { id: T; testo: string }[]
}) {
  return (
    <div className="mb-5 flex gap-1.5 rounded-xl bg-gray-100 p-1">
      {voci.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => onChange(v.id)}
          aria-pressed={valore === v.id}
          className={`min-h-[38px] flex-1 rounded-lg px-2 text-sm font-semibold transition ${
            valore === v.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          {v.testo}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ intertitoli */

export function Occhiello({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">{children}</h2>
  )
}

/* ------------------------------------------------------------------ righe */

/** Righe attaccate una all'altra, separate da una linea sottile. */
export function Elenco({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200">
      {children}
    </div>
  )
}

export function Riga({
  to,
  onClick,
  icona,
  tinta = 'bg-gray-100 text-gray-600',
  titolo,
  dettaglio,
  coda,
}: {
  to?: string
  onClick?: () => void
  icona?: ReactNode
  tinta?: string
  titolo: ReactNode
  dettaglio?: ReactNode
  coda?: ReactNode
}) {
  const dentro = (
    <>
      {icona && (
        <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${tinta}`}>{icona}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-900">{titolo}</span>
        {dettaglio && <span className="mt-0.5 block text-xs text-gray-500">{dettaglio}</span>}
      </span>
      {coda}
    </>
  )
  const classi = 'flex min-h-[58px] items-center gap-3 bg-white px-4 py-3 text-left transition hover:bg-gray-50'
  if (to) return <Link to={to} className={classi}>{dentro}</Link>
  if (onClick) return <button type="button" onClick={onClick} className={classi}>{dentro}</button>
  return <div className={classi}>{dentro}</div>
}

/* ------------------------------------------------------------- avvertenze */

const TINTE = {
  neutro: 'border-gray-200 bg-white text-gray-700',
  attenzione: 'border-amber-200 bg-amber-50 text-gray-700',
  urgente: 'border-orange-200 bg-orange-50 text-gray-700',
  buono: 'border-emerald-200 bg-emerald-50 text-gray-700',
}

export function Nota({
  tono = 'neutro',
  icona,
  children,
}: {
  tono?: keyof typeof TINTE
  icona?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${TINTE[tono]}`}>
      {icona && <span className="mt-0.5 flex-none">{icona}</span>}
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------ stati vuoti */

/**
 * Uno stato vuoto che dice cosa fare, non solo che non c'è niente.
 * «Nessun turno» lascia fermi; «creane uno e apri i posti» no.
 */
export function Vuoto({
  icona,
  titolo,
  spiegazione,
  azione,
}: {
  icona?: ReactNode
  titolo: string
  spiegazione?: string
  azione?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
      {icona && <div className="mx-auto mb-4 text-gray-300">{icona}</div>}
      <p className="font-semibold text-gray-900">{titolo}</p>
      {spiegazione && (
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-gray-500">{spiegazione}</p>
      )}
      {azione && <div className="mt-5 flex justify-center">{azione}</div>}
    </div>
  )
}

export function Caricamento({ cosa }: { cosa: string }) {
  return <p className="py-10 text-center text-gray-500">Caricamento {cosa}…</p>
}

/* ------------------------------------------------------------- copertura */

/**
 * Quanto è pieno qualcosa. Barra, numero e parola dicono la stessa cosa in
 * tre modi: il colore da solo non lo distinguono tutti.
 */
export function Copertura({
  presi,
  totale,
  colore = 'bg-primary-600',
}: {
  presi: number
  totale: number
  colore?: string
}) {
  const perc = totale > 0 ? Math.round((presi / totale) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full ${colore}`}
          style={{ width: perc === 0 ? '3px' : `${perc}%` }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums text-gray-700">
        {presi}/{totale}
      </span>
    </div>
  )
}

/* ------------------------------------------- azione principale, in basso */

/**
 * Sul telefono l'azione principale scende dove il pollice arriva, appena
 * sopra la barra di navigazione; su schermo largo sparisce, perché lì vive
 * nell'intestazione.
 * Chi la usa deve lasciare spazio in fondo alla pagina: `pb-32 lg:pb-0`.
 */
export function AzionePrincipale({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 z-30 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent px-5 pb-3 pt-4 lg:hidden"
      style={{ bottom: 'var(--altezza-barra-basso)' }}
    >
      <div className="mx-auto max-w-3xl">{children}</div>
    </div>
  )
}

export function BottoneGrande({
  to,
  onClick,
  children,
  tono = 'primario',
}: {
  to?: string
  onClick?: () => void
  children: ReactNode
  tono?: 'primario' | 'scuro'
}) {
  const sfondo =
    tono === 'scuro'
      ? 'bg-gray-900 text-white hover:bg-gray-800'
      : 'bg-giallo text-gray-900 hover:bg-giallo-scuro'
  const classi = `flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-base font-bold shadow-lg transition ${sfondo}`
  if (to) return <Link to={to} className={classi}>{children}</Link>
  return (
    <button type="button" onClick={onClick} className={classi}>
      {children}
    </button>
  )
}

/** Il contenitore standard di una pagina: largo il giusto, e con lo spazio
 *  in fondo per non farsi coprire dall'azione principale sul telefono. */
export function Pagina({ children, azione }: { children: ReactNode; azione?: boolean }) {
  return <div className={`mx-auto max-w-3xl ${azione ? 'pb-32 lg:pb-0' : ''}`}>{children}</div>
}

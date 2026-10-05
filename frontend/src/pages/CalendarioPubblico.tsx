import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { addMonths, format, parseISO, startOfToday } from 'date-fns'
import { it } from 'date-fns/locale'
import { CalendarX, ChevronLeft, ChevronRight } from 'lucide-react'
import { Copertura, Occhiello, Vuoto } from '../components/ui'

/**
 * Il calendario dei turni in sola lettura, per chi non ha un account.
 *
 * Si apre da un link con un codice (/calendario/<codice>), mese per mese.
 * Non usa il client dell'app, che aggiunge il token di sessione e rimanda
 * al login: qui non c'e' nessuna sessione, e non deve essercene bisogno.
 */

type Posto = { quantita: string | null; persona: string | null }
type Portata = { tipo: string; ricetta: string | null; posti: Posto[] }
type Turno = { data: string; tipo: string; porzioni: number | null; totale: number; coperti: number; portate: Portata[] }

const API = import.meta.env.VITE_API_URL || '/api/v1'
const meseDi = (d: Date) => format(d, 'yyyy-MM')

export default function CalendarioPubblico() {
  const { codice } = useParams()
  const [parametri, setParametri] = useSearchParams()
  const mese = /^\d{4}-\d{2}$/.test(parametri.get('mese') || '') ? parametri.get('mese')! : meseDi(new Date())
  const [stato, setStato] = useState<'carico' | 'pronto' | 'non-trovato' | 'errore'>('carico')
  const [turni, setTurni] = useState<Turno[]>([])

  useEffect(() => {
    document.title = 'Calendario dei turni · La Brigata'
  }, [])

  useEffect(() => {
    let annullato = false
    setStato('carico')
    fetch(`${API}/pubblico/calendario/${encodeURIComponent(codice || '')}?mese=${mese}`)
      .then(async (r) => {
        if (annullato) return
        if (r.status === 404) return setStato('non-trovato')
        if (!r.ok) return setStato('errore')
        const dati = await r.json()
        if (annullato) return
        setTurni(dati.turni || [])
        setStato('pronto')
      })
      .catch(() => !annullato && setStato('errore'))
    return () => {
      annullato = true
    }
  }, [codice, mese])

  const primoDelMese = parseISO(`${mese}-01`)
  const vaiA = (delta: number) => setParametri({ mese: meseDi(addMonths(primoDelMese, delta)) })
  const oggi = startOfToday()

  if (stato === 'non-trovato') {
    return (
      <Cornice>
        <Vuoto
          icona={<CalendarX className="h-10 w-10" />}
          titolo="Questo link non funziona più"
          spiegazione="Il calendario è stato spostato su un link nuovo. Chiedilo a chi ti aveva mandato questo."
        />
      </Cornice>
    )
  }

  return (
    <Cornice>
      {/* Mese, con le frecce per spostarsi */}
      <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => vaiA(-1)}
          aria-label="Mese precedente"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="iniziale-maiuscola flex-1 text-center text-xl font-bold text-gray-900">
          {format(primoDelMese, 'MMMM yyyy', { locale: it })}
        </h2>
        <button
          type="button"
          onClick={() => vaiA(1)}
          aria-label="Mese successivo"
          className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-100"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {stato === 'carico' && <p className="py-10 text-center text-gray-500">Carico il calendario…</p>}
      {stato === 'errore' && (
        <p className="py-10 text-center text-gray-500">Il calendario non si è caricato. Riprova tra poco.</p>
      )}

      {stato === 'pronto' && turni.length === 0 && (
        <Vuoto titolo="Nessun turno in questo mese" spiegazione="Prova a guardare il mese dopo con la freccia qui sopra." />
      )}

      {stato === 'pronto' && turni.length > 0 && (
        <div className="space-y-4">
          {turni.map((t) => {
            const giorno = parseISO(t.data)
            const passato = giorno < oggi
            const liberi = t.totale - t.coperti
            return (
              <article
                key={`${t.data}-${t.tipo}`}
                className={`overflow-hidden rounded-2xl border bg-white ${passato ? 'border-gray-200 opacity-70' : liberi > 0 ? 'border-giallo/60' : 'border-gray-200'}`}
              >
                <header className="flex items-start gap-4 p-4">
                  <div className="w-12 flex-none text-center">
                    <p className="font-display text-3xl font-bold leading-none text-gray-900">{format(giorno, 'd')}</p>
                    <p className="iniziale-maiuscola mt-1 text-xs text-gray-500">{format(giorno, 'EEE', { locale: it })}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">
                      <span className="iniziale-maiuscola inline-block">{t.tipo}</span>
                      {t.porzioni ? ` · ${t.porzioni} porzioni` : ''}
                    </p>
                    {t.totale > 0 ? (
                      <>
                        <div className="mt-2">
                          <Copertura presi={t.coperti} totale={t.totale} />
                        </div>
                        <p className={`mt-1.5 text-sm ${liberi === 0 ? 'text-primary-700' : 'text-orange-700'}`}>
                          {passato
                            ? 'Turno passato'
                            : liberi === 0
                              ? 'Tutti i posti coperti'
                              : liberi === 1
                                ? 'Manca 1 posto'
                                : `Mancano ${liberi} posti`}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-gray-500">Posti non ancora aperti</p>
                    )}
                  </div>
                </header>

                {t.portate.length > 0 && (
                  <div className="border-t border-gray-200 px-4 pb-4 pt-3">
                    {t.portate.map((p) => (
                      <section key={p.tipo} className="mt-3 first:mt-0">
                        <Occhiello>
                          {p.tipo}
                          {p.ricetta && p.tipo !== 'frutta' && (
                            <span className="ml-1 normal-case tracking-normal text-gray-500">· {p.ricetta}</span>
                          )}
                        </Occhiello>
                        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                          {p.posti.map((posto, i) => (
                            <li key={i} className="flex min-h-[44px] items-center gap-3 px-3 py-2 text-[15px]">
                              <span className="w-28 flex-none text-sm text-gray-500">{posto.quantita || '—'}</span>
                              {posto.persona ? (
                                <span className="min-w-0 flex-1 truncate font-semibold text-gray-900">{posto.persona}</span>
                              ) : (
                                <span className="flex-1 font-semibold text-orange-700">libero</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      <p className="mt-8 text-center text-sm text-gray-500">
        Vuoi prendere un posto libero? Rispondi al sondaggio sul gruppo delle cucine o scrivi a chi le coordina.
      </p>
    </Cornice>
  )
}

function Cornice({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div
        className="mx-auto max-w-2xl px-4 pb-10"
        style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
      >
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-labrigata.png" alt="" className="h-11 w-11" />
          <div>
            <h1 className="text-lg font-bold leading-tight text-gray-900">La Brigata</h1>
            <p className="text-sm text-gray-500">Calendario dei turni in cucina</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

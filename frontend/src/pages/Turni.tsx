import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../services/authService'
import { addMonths, format, isBefore, parseISO, startOfToday } from 'date-fns'
import { it } from 'date-fns/locale'
import { Calendar, Plus, Search } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { AzionePrincipale, BottoneGrande } from '../components/ui'

/**
 * Elenco dei turni.
 *
 * Si apriva sul mese corrente, quindi a fine settembre mostrava per prime
 * quattro cene già svolte e piene, e chi cercava dove dare una mano doveva
 * scorrere fino in fondo. Ora si apre su quello che deve ancora succedere, e
 * i turni passati stanno dietro una linguetta.
 */

type Scoperto = { tipo: string; liberi: number }

type Turno = {
  id: string
  data_turno: string
  tipo_turno: string
  numero_porzioni?: number | null
  totale_slot?: number | string | null
  slot_assegnati?: number | string | null
  scoperti?: Scoperto[] | null
}

/** Quanti mesi avanti e indietro chiedere al server in una volta sola. */
const ORIZZONTE_MESI = 6

const num = (v: unknown) => Number(v) || 0

/**
 * Cosa manca, detto in italiano.
 * «11/14» è un dato; «mancano 3 posti di frutta» è una cosa che qualcuno può
 * andare a fare.
 */
function cosaManca(turno: Turno): string | null {
  const totale = num(turno.totale_slot)
  if (totale === 0) return 'Nessun posto ancora aperto'

  const liberi = totale - num(turno.slot_assegnati)
  if (liberi === 0) return null

  const scoperti = turno.scoperti || []
  if (scoperti.length === 0) return `${liberi} ${liberi === 1 ? 'posto libero' : 'posti liberi'}`

  if (scoperti.length === 1) {
    const s = scoperti[0]
    return s.liberi === 1 ? `Manca 1 posto di ${s.tipo}` : `Mancano ${s.liberi} posti di ${s.tipo}`
  }

  // «frutta (2)» e non «2 frutta»: «1 dolci» suonava sbagliato.
  const primi = scoperti.slice(0, 2).map((s) => `${s.tipo} (${s.liberi})`).join(', ')
  const altre = scoperti.length - 2
  const resto = altre === 1 ? " e un'altra portata" : altre > 1 ? ` e altre ${altre} portate` : ''
  return `Mancano ${liberi} posti: ${primi}${resto}`
}

/**
 * Il colore dice lo stato, ma mai da solo: accanto c'è sempre il numero e la
 * riga che nomina cosa manca, perché il colore non lo distinguono tutti.
 */
function statoCopertura(turno: Turno) {
  const totale = num(turno.totale_slot)
  const presi = num(turno.slot_assegnati)
  if (totale === 0) return { barra: 'bg-gray-300', testo: 'text-gray-500', bordo: 'border-gray-200', perc: 0 }
  const perc = Math.round((presi / totale) * 100)
  if (presi === 0) return { barra: 'bg-orange-600', testo: 'text-orange-700', bordo: 'border-orange-200', perc }
  if (presi < totale) return { barra: 'bg-emerald-700', testo: 'text-amber-700', bordo: 'border-amber-200', perc }
  return { barra: 'bg-emerald-700', testo: 'text-emerald-700', bordo: 'border-gray-200', perc }
}

function SchedaTurno({ turno }: { turno: Turno }) {
  const data = parseISO(turno.data_turno)
  const stato = statoCopertura(turno)
  const manca = cosaManca(turno)
  const totale = num(turno.totale_slot)

  return (
    <Link
      to={`/turni/${turno.id}`}
      className={`flex items-center gap-4 rounded-2xl border ${stato.bordo} bg-white p-4 shadow-sm transition hover:shadow-md`}
    >
      <div className="w-12 flex-none text-center">
        <div className="text-2xl font-bold leading-none tabular-nums text-gray-900">{format(data, 'd')}</div>
        <div className="iniziale-maiuscola mt-1 text-xs text-gray-500">{format(data, 'EEE', { locale: it })}</div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-gray-900">
          {/* La maiuscola va al tipo di turno, non a ogni parola della riga:
              con `capitalize` sull'intero blocco si leggeva "55 Porzioni". */}
          <span className="capitalize">{turno.tipo_turno}</span>
          {turno.numero_porzioni ? ` · ${turno.numero_porzioni} porzioni` : ''}
        </div>

        <div className="mt-2 flex items-center gap-3">
          <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full rounded-full ${stato.barra}`}
              style={{ width: stato.perc === 0 ? '3px' : `${stato.perc}%` }}
            />
          </div>
          <span className="text-xs font-bold tabular-nums text-gray-700">
            {num(turno.slot_assegnati)}/{totale}
          </span>
        </div>

        <div className={`mt-2 text-xs ${manca ? stato.testo : 'text-emerald-700'}`}>
          {manca || 'Tutti i posti coperti'}
        </div>
      </div>
    </Link>
  )
}

const Turni = () => {
  const { user } = useAuth()
  const puoGestire = user?.ruolo === 'admin' || user?.ruolo === 'gestore_cucine'
  const [vista, setVista] = useState<'arrivo' | 'passati'>('arrivo')

  const oggi = startOfToday()
  const dataInizio = format(addMonths(oggi, -ORIZZONTE_MESI), 'yyyy-MM-dd')
  const dataFine = format(addMonths(oggi, ORIZZONTE_MESI), 'yyyy-MM-dd')

  const { data, isLoading } = useQuery({
    queryKey: ['turni', dataInizio, dataFine],
    queryFn: async () => (await api.get('/turni', { params: { dataInizio, dataFine } })).data,
  })

  const { inArrivo, passati } = useMemo(() => {
    const tutti: Turno[] = data?.turni || []
    const arrivo = tutti.filter((t) => !isBefore(parseISO(t.data_turno), oggi))
    const prima = tutti.filter((t) => isBefore(parseISO(t.data_turno), oggi)).reverse()
    return { inArrivo: arrivo, passati: prima }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const elenco = vista === 'arrivo' ? inArrivo : passati

  // Raggruppati per mese: senza, un elenco lungo perde il filo delle date.
  const perMese = useMemo(() => {
    const gruppi: { mese: string; turni: Turno[] }[] = []
    for (const t of elenco) {
      const mese = format(parseISO(t.data_turno), 'LLLL yyyy', { locale: it })
      const ultimo = gruppi[gruppi.length - 1]
      if (ultimo && ultimo.mese === mese) ultimo.turni.push(t)
      else gruppi.push({ mese, turni: [t] })
    }
    return gruppi
  }, [elenco])

  const scoperti = inArrivo.filter((t) => num(t.slot_assegnati) === 0 && num(t.totale_slot) > 0)

  return (
    <div className="mx-auto max-w-3xl pb-32 lg:pb-0">
      <div className="mb-5 flex items-center gap-3">
        <h1 className="flex-1 text-2xl font-bold tracking-tight text-gray-900 lg:text-3xl">Turni</h1>
        <Link
          to="/turni/calendario"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-700 transition hover:bg-gray-100"
          aria-label="Vedi il calendario del mese"
        >
          <Calendar className="h-5 w-5" />
        </Link>
        {puoGestire && (
          <Link
            to="/turni/nuovo"
            className="hidden h-11 items-center gap-2 rounded-xl bg-giallo px-4 text-sm font-semibold text-gray-900 transition hover:bg-giallo-scuro lg:flex"
          >
            <Plus className="h-4 w-4" />
            Nuovo turno
          </Link>
        )}
      </div>

      <div className="mb-5 flex gap-1.5 rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setVista('arrivo')}
          aria-pressed={vista === 'arrivo'}
          className={`min-h-[38px] flex-1 rounded-lg text-sm font-semibold transition ${
            vista === 'arrivo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          In arrivo{inArrivo.length ? ` (${inArrivo.length})` : ''}
        </button>
        <button
          type="button"
          onClick={() => setVista('passati')}
          aria-pressed={vista === 'passati'}
          className={`min-h-[38px] flex-1 rounded-lg text-sm font-semibold transition ${
            vista === 'passati' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          Passati
        </button>
      </div>

      {vista === 'arrivo' && scoperti.length > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <Search className="mt-0.5 h-[18px] w-[18px] flex-none text-orange-700" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-gray-700">
            {scoperti.length === 1 ? 'Un turno è' : `${scoperti.length} turni sono`} ancora{' '}
            <strong className="font-semibold text-gray-900">senza nessuno</strong>.
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-gray-500">Caricamento turni…</p>
      ) : elenco.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <Calendar className="mx-auto mb-4 h-12 w-12 text-gray-300" aria-hidden="true" />
          <p className="font-semibold text-gray-900">
            {vista === 'arrivo' ? 'Nessun turno in programma' : 'Nessun turno passato'}
          </p>
          {vista === 'arrivo' && puoGestire && (
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-gray-500">
              Creane uno e apri i posti: i soci potranno prenotarsi da soli.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {perMese.map((gruppo) => (
            <section key={gruppo.mese}>
              <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                {gruppo.mese}
              </h2>
              <div className="flex flex-col gap-2.5">
                {gruppo.turni.map((t) => (
                  <SchedaTurno key={t.id} turno={t} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Sul telefono l'azione principale sta in basso, dove arriva il pollice. */}
      {puoGestire && (
        <AzionePrincipale>
          <BottoneGrande to="/turni/nuovo">
            <Plus className="h-5 w-5" />
            Nuovo turno
          </BottoneGrande>
        </AzionePrincipale>
      )}
    </div>
  )
}

export default Turni

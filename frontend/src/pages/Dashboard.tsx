import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../services/authService'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { AlertCircle, Calendar, ChefHat, ChevronRight, MessageSquare, Users, Vote } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Caricamento, Copertura, Elenco, Nota, Occhiello, Pagina, Riga, Vuoto } from '../components/ui'

/**
 * La schermata iniziale.
 *
 * Apriva con cinque riquadri identici — turni, slot, avvisi, sondaggi,
 * assemblee — quattro dei quali dicevano stabilmente 0, e occupavano tutto il
 * primo schermo. I turni, il motivo per cui la gente apre l'app, stavano
 * sotto la piega.
 *
 * Ora apre sul prossimo turno, dice cosa gli manca, e mostra un contatore
 * soltanto quando ha qualcosa da dire.
 */

type Scoperto = { tipo: string; liberi: number }

const num = (v: unknown) => Number(v) || 0

function quandoAccade(data: Date) {
  const giorni = differenceInCalendarDays(data, new Date())
  if (giorni === 0) return 'oggi'
  if (giorni === 1) return 'domani'
  if (giorni < 7) return `fra ${giorni} giorni`
  return format(data, "d MMMM", { locale: it })
}

/** Cosa manca, nominato: «11/14» è un dato, «mancano 3 posti di frutta» no. */
function cosaManca(scoperti: Scoperto[] | null | undefined, liberi: number) {
  if (liberi === 0) return null
  const s = scoperti || []
  if (s.length === 0) return `${liberi} ${liberi === 1 ? 'posto libero' : 'posti liberi'}`
  if (s.length === 1) {
    return s[0].liberi === 1
      ? `Manca 1 posto di ${s[0].tipo}`
      : `Mancano ${s[0].liberi} posti di ${s[0].tipo}`
  }
  // «frutta (2)» e non «2 frutta»: «1 dolci» suonava sbagliato.
  const primi = s.slice(0, 2).map((x) => `${x.tipo} (${x.liberi})`).join(', ')
  const altre = s.length - 2
  const resto = altre === 1 ? " e un'altra portata" : altre > 1 ? ` e altre ${altre} portate` : ''
  return `Mancano ${liberi} posti: ${primi}${resto}`
}

function ProssimoTurno({ turno }: { turno: any }) {
  const data = parseISO(turno.data_turno)
  const totale = num(turno.totale_slot)
  const presi = num(turno.slot_assegnati)
  const manca = cosaManca(turno.scoperti, totale - presi)

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold leading-none tracking-tight text-gray-900">
          {format(data, 'EEEE d', { locale: it })}
        </span>
        <span className="text-base font-semibold text-gray-500">{format(data, 'MMMM', { locale: it })}</span>
      </div>
      <p className="iniziale-maiuscola mt-1.5 text-sm text-gray-500">
        {turno.tipo_turno}
        {turno.numero_porzioni ? ` · ${turno.numero_porzioni} porzioni` : ''}
        <span> · {quandoAccade(data)}</span>
      </p>

      {totale > 0 && (
        <div className="mt-4">
          <Copertura presi={presi} totale={totale} />
        </div>
      )}

      {manca && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm leading-relaxed text-gray-700">
          {manca}
          {totale > 0 && `, su ${totale} posti.`}
        </div>
      )}

      <Link
        to={`/turni/${turno.id}`}
        className="mt-4 flex min-h-[46px] items-center justify-center rounded-2xl bg-gray-900 text-[15px] font-semibold text-white transition hover:bg-gray-800"
      >
        {manca ? 'Prendi un posto' : 'Guarda il turno'}
      </Link>
    </div>
  )
}

const Dashboard = () => {
  const { user } = useAuth()

  const { data: cruscotto, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get('/dashboard')).data,
  })

  const { data: datiTurni } = useQuery({
    queryKey: ['turni', 'prossimi-dashboard'],
    queryFn: async () =>
      (
        await api.get('/turni', {
          params: { dataInizio: format(new Date(), 'yyyy-MM-dd'), limit: 5 },
        })
      ).data,
  })

  if (isLoading) return <Caricamento cosa="della schermata" />

  const stats = cruscotto?.stats || {}
  const impegni = cruscotto?.impegni || []
  const turni = datiTurni?.turni || []
  const prossimo = turni[0]

  // Solo quello che ha davvero qualcosa da dire: un contatore a zero occupa
  // spazio e non chiede niente.
  const daGuardare = [
    {
      quanti: num(stats.avvisi_non_letti),
      testo: (n: number) => `${n} ${n === 1 ? 'avviso non letto' : 'avvisi non letti'}`,
      to: '/avvisi',
      icona: <AlertCircle className="h-[18px] w-[18px]" />,
      tinta: 'bg-orange-50 text-orange-700',
    },
    {
      quanti: num(stats.sondaggi_aperti),
      testo: (n: number) => `${n} ${n === 1 ? 'sondaggio aperto' : 'sondaggi aperti'}`,
      to: '/sondaggi',
      icona: <MessageSquare className="h-[18px] w-[18px]" />,
      tinta: 'bg-violet-50 text-violet-700',
    },
    {
      quanti: num(stats.assemblee_prossime),
      testo: (n: number) => `${n} ${n === 1 ? 'assemblea in programma' : 'assemblee in programma'}`,
      to: '/assemblee',
      icona: <Users className="h-[18px] w-[18px]" />,
      tinta: 'bg-indigo-50 text-indigo-700',
    },
    {
      quanti: num(stats.votazioni_aperte),
      testo: (n: number) => `${n} ${n === 1 ? 'votazione aperta' : 'votazioni aperte'}`,
      to: '/votazioni',
      icona: <Vote className="h-[18px] w-[18px]" />,
      tinta: 'bg-amber-50 text-amber-700',
    },
  ].filter((v) => v.quanti > 0)

  const scoperti = turni.filter((t: any) => num(t.slot_assegnati) === 0 && num(t.totale_slot) > 0)

  return (
    <Pagina>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 lg:text-3xl">
          Ciao {user?.nome}
        </h1>
        <p className="iniziale-maiuscola mt-1 text-sm text-gray-500">
          {format(new Date(), 'EEEE d MMMM', { locale: it })}
        </p>
      </div>

      <div className="flex flex-col gap-7">
        <section>
          <Occhiello>Il prossimo turno</Occhiello>
          {prossimo ? (
            <ProssimoTurno turno={prossimo} />
          ) : (
            <Vuoto
              icona={<Calendar className="mx-auto h-12 w-12" aria-hidden="true" />}
              titolo="Nessun turno in programma"
              spiegazione="Quando ne viene aperto uno lo trovi qui, con i posti ancora liberi."
            />
          )}
        </section>

        {daGuardare.length > 0 && (
          <section>
            <Occhiello>Da guardare</Occhiello>
            <Elenco>
              {daGuardare.map((v) => (
                <Riga
                  key={v.to}
                  to={v.to}
                  icona={v.icona}
                  tinta={v.tinta}
                  titolo={v.testo(v.quanti)}
                  coda={<ChevronRight className="h-[18px] w-[18px] flex-none text-gray-400" aria-hidden="true" />}
                />
              ))}
            </Elenco>
          </section>
        )}

        <section>
          <Occhiello>I tuoi posti</Occhiello>
          {impegni.length > 0 ? (
            <Elenco>
              {impegni.map((im: any) => (
                <Riga
                  key={im.id}
                  to={`/turni/${im.turno_id}`}
                  icona={<ChefHat className="h-[18px] w-[18px]" />}
                  tinta="bg-emerald-50 text-emerald-700"
                  titolo={
                    <span className="iniziale-maiuscola">
                      {format(parseISO(im.data_turno), 'EEEE d MMMM', { locale: it })}
                    </span>
                  }
                  dettaglio={
                    <span className="iniziale-maiuscola">
                      {im.tipo_slot}
                      {im.numero_porzioni ? ` · ${im.numero_porzioni} porzioni` : ''}
                    </span>
                  }
                  coda={<ChevronRight className="h-[18px] w-[18px] flex-none text-gray-400" aria-hidden="true" />}
                />
              ))}
            </Elenco>
          ) : (
            <Vuoto
              titolo="Non hai ancora preso un posto"
              spiegazione={
                prossimo && cosaManca(prossimo.scoperti, num(prossimo.totale_slot) - num(prossimo.slot_assegnati))
                  ? `Nel turno di ${format(parseISO(prossimo.data_turno), 'EEEE d', { locale: it })} ce ne sono ancora liberi.`
                  : 'Quando ti prenoti per un turno lo trovi qui.'
              }
            />
          )}
        </section>

        {scoperti.length > 0 && (
          <section>
            <Nota tono="urgente" icona={<Calendar className="h-[18px] w-[18px] text-orange-700" aria-hidden="true" />}>
              {scoperti.length === 1 ? 'Un turno è' : `${scoperti.length} turni sono`} ancora{' '}
              <strong className="font-semibold text-gray-900">senza nessuno</strong>.{' '}
              <Link to="/turni" className="font-semibold text-primary-700 underline-offset-2 hover:underline">
                Vedi quali
              </Link>
            </Nota>
          </section>
        )}
      </div>
    </Pagina>
  )
}

export default Dashboard

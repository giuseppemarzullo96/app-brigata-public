import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../services/authService'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { CheckCircle2, Clock, Lock, Plus, Vote } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  AzionePrincipale,
  BottoneGrande,
  Caricamento,
  Copertura,
  IntestazionePagina,
  Occhiello,
  Pagina,
  Vuoto,
} from '../components/ui'

/**
 * Votazioni a scrutinio segreto.
 *
 * La lista era una griglia di schede con etichette in grassetto. La cosa che
 * conta — «devi votare» — stava in un riquadro piccolo. Ora quella urgenza
 * apre la pagina, e il tasto è grande come sulla Dashboard.
 */

const STATO: Record<string, string> = {
  bozza: 'Bozza',
  aperta: 'Urne aperte',
  chiusa: 'Chiusa',
  annullata: 'Annullata',
}

function SchedaVotazione({ votazione, isAdmin }: { votazione: any; isAdmin: boolean }) {
  const daVotare =
    votazione.stato === 'aperta' && votazione.sono_avente_diritto && !votazione.ho_votato
  const aventi = Number(votazione.aventi_diritto) || 0
  const votanti = Number(votazione.votanti) || 0

  return (
    <article
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        daVotare ? 'border-amber-300' : 'border-gray-200'
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
        {STATO[votazione.stato] || votazione.stato}
      </p>
      <h3 className="mt-1 text-[15px] font-bold leading-snug tracking-tight text-gray-900">
        {votazione.titolo}
      </h3>
      {votazione.descrizione && (
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-gray-500">{votazione.descrizione}</p>
      )}

      <p className="mt-3 text-sm text-gray-500">
        {votazione.seggi_da_eleggere}{' '}
        {votazione.seggi_da_eleggere === 1 ? 'posto da coprire' : 'posti da coprire'}
        {' · '}
        fino a {votazione.preferenze_max}{' '}
        {votazione.preferenze_max === 1 ? 'preferenza' : 'preferenze'}
      </p>

      {isAdmin && votazione.stato !== 'bozza' && aventi > 0 && (
        <div className="mt-3">
          <Copertura presi={votanti} totale={aventi} />
          <p className="mt-1 text-xs text-gray-500">
            {votanti} hanno votato su {aventi} aventi diritto
          </p>
        </div>
      )}

      {daVotare && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-gray-700">
          <Clock className="mt-0.5 h-4 w-4 flex-none text-amber-700" aria-hidden="true" />
          Non hai ancora votato. Le urne sono aperte.
        </div>
      )}
      {votazione.stato === 'aperta' && votazione.ho_votato && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm text-gray-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-700" aria-hidden="true" />
          Il tuo voto è stato registrato.
        </div>
      )}
      {votazione.stato === 'aperta' && !votazione.sono_avente_diritto && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm text-gray-600">
          <Lock className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
          Non sei fra gli aventi diritto.
        </div>
      )}
      {votazione.aperta_at && (
        <p className="mt-2 text-xs text-gray-400">
          Aperta il {format(new Date(votazione.aperta_at), "d MMMM yyyy, HH:mm", { locale: it })}
        </p>
      )}

      <Link
        to={`/votazioni/${votazione.id}`}
        className={`mt-4 flex min-h-[46px] items-center justify-center rounded-2xl text-sm font-semibold transition ${
          daVotare
            ? 'bg-gray-900 text-white hover:bg-gray-800'
            : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
        }`}
      >
        {daVotare ? 'Vota ora' : votazione.stato === 'chiusa' ? 'Vedi i risultati' : 'Apri'}
      </Link>
    </article>
  )
}

const Votazioni = () => {
  const { user } = useAuth()
  const isAdmin = user?.ruolo === 'admin'

  const { data, isLoading } = useQuery({
    queryKey: ['votazioni'],
    queryFn: async () => (await api.get('/votazioni')).data,
    refetchInterval: 20000,
  })

  const { daFare, altre } = useMemo(() => {
    const tutte = data?.votazioni || []
    const daVotare = (v: any) => v.stato === 'aperta' && v.sono_avente_diritto && !v.ho_votato
    return {
      daFare: tutte.filter(daVotare),
      altre: tutte.filter((v: any) => !daVotare(v)),
    }
  }, [data])

  if (isLoading) return <Caricamento cosa="delle votazioni" />

  return (
    <Pagina azione={isAdmin}>
      <IntestazionePagina
        titolo="Votazioni"
        sottotitolo="Elezione degli organi sociali a scrutinio segreto"
        azioni={
          isAdmin ? (
            <Link
              to="/votazioni/nuova"
              className="hidden h-11 flex-none items-center gap-2 rounded-xl bg-giallo px-4 text-sm font-semibold text-gray-900 transition hover:bg-giallo-scuro lg:flex"
            >
              <Plus className="h-4 w-4" />
              Nuova votazione
            </Link>
          ) : undefined
        }
      />

      {daFare.length === 0 && altre.length === 0 ? (
        <Vuoto
          icona={<Vote className="mx-auto h-12 w-12" aria-hidden="true" />}
          titolo="Nessuna votazione"
          spiegazione={
            isAdmin
              ? 'Quando apri le urne i soci aventi diritto votano da qui, dal telefono.'
              : 'Quando c’è da votare lo trovi qui. Fino ad allora non c’è niente da fare.'
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {daFare.length > 0 && (
            <section>
              <Occhiello>Da votare</Occhiello>
              <div className="flex flex-col gap-3">
                {daFare.map((v: any) => (
                  <SchedaVotazione key={v.id} votazione={v} isAdmin={isAdmin} />
                ))}
              </div>
            </section>
          )}
          {altre.length > 0 && (
            <section>
              <Occhiello>{daFare.length > 0 ? 'Le altre' : 'Elenco'}</Occhiello>
              <div className="flex flex-col gap-3">
                {altre.map((v: any) => (
                  <SchedaVotazione key={v.id} votazione={v} isAdmin={isAdmin} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {isAdmin && (
        <AzionePrincipale>
          <BottoneGrande to="/votazioni/nuova">
            <Plus className="h-5 w-5" />
            Nuova votazione
          </BottoneGrande>
        </AzionePrincipale>
      )}
    </Pagina>
  )
}

export default Votazioni

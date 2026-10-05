import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../services/authService'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { MessageSquare, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  AzionePrincipale,
  BottoneGrande,
  Caricamento,
  IntestazionePagina,
  Occhiello,
  Pagina,
  Vuoto,
} from '../components/ui'

/**
 * Sondaggi.
 *
 * Erano tessere identiche in griglia, con lo stato in inglese minuscolo
 * (aperto/chiuso/bozza) e tre bottoni per riga. Ora quelli a cui si può
 * ancora rispondere vengono prima, e il tasto è uno solo: rispondi o vedi.
 */

const STATO: Record<string, { etichetta: string; classe: string }> = {
  bozza: { etichetta: 'Bozza', classe: 'text-gray-500' },
  aperto: { etichetta: 'Aperto', classe: 'text-emerald-700' },
  chiuso: { etichetta: 'Chiuso', classe: 'text-gray-500' },
}

function SchedaSondaggio({
  sondaggio,
  isAdmin,
  onElimina,
}: {
  sondaggio: any
  isAdmin: boolean
  onElimina: (id: string) => void
}) {
  const s = STATO[sondaggio.stato] || STATO.bozza
  const risposte = Number(sondaggio.totale_risposte) || 0
  const aperto = sondaggio.stato === 'aperto'

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${s.classe}`}>{s.etichetta}</p>
          <h3 className="mt-1 text-[15px] font-bold leading-snug tracking-tight text-gray-900">
            {sondaggio.titolo}
          </h3>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              if (confirm('Eliminare questo sondaggio? L’operazione non si annulla.')) onElimina(sondaggio.id)
            }}
            aria-label="Elimina sondaggio"
            title="Elimina sondaggio"
            className="-my-2 -mr-2 flex h-11 w-11 flex-none items-center justify-center rounded-xl text-gray-400 transition hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      {sondaggio.descrizione && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-500">{sondaggio.descrizione}</p>
      )}

      <p className="mt-3 text-sm text-gray-500">
        {risposte === 1 ? '1 risposta' : `${risposte} risposte`}
        {sondaggio.data_chiusura && (
          <>
            {' · chiude il '}
            {format(new Date(sondaggio.data_chiusura), 'd MMMM', { locale: it })}
          </>
        )}
      </p>

      <Link
        to={`/sondaggi/${sondaggio.id}`}
        className={`mt-4 flex min-h-[44px] items-center justify-center rounded-xl text-sm font-semibold transition ${
          aperto
            ? 'bg-gray-900 text-white hover:bg-gray-800'
            : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
        }`}
      >
        {aperto ? 'Rispondi' : 'Vedi i risultati'}
      </Link>
    </article>
  )
}

const Sondaggi = () => {
  const { user } = useAuth()
  const isAdmin = user?.ruolo === 'admin'
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['sondaggi'],
    queryFn: async () => (await api.get('/sondaggi')).data,
  })

  const deleteMutation = useMutation({
    mutationFn: async (sondaggioId: string) => {
      await api.delete(`/sondaggi/${sondaggioId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sondaggi'] })
      queryClient.invalidateQueries({ queryKey: ['avvisi'] })
      toast.success('Sondaggio eliminato')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Errore durante l'eliminazione")
    },
  })

  const { aperti, altri } = useMemo(() => {
    const tutti = data?.sondaggi || []
    return {
      aperti: tutti.filter((s: any) => s.stato === 'aperto'),
      altri: tutti.filter((s: any) => s.stato !== 'aperto'),
    }
  }, [data])

  if (isLoading) return <Caricamento cosa="dei sondaggi" />

  return (
    <Pagina azione={isAdmin}>
      <IntestazionePagina
        titolo="Sondaggi"
        azioni={
          isAdmin ? (
            <Link
              to="/sondaggi/nuovo"
              className="hidden h-11 flex-none items-center gap-2 rounded-xl bg-giallo px-4 text-sm font-semibold text-gray-900 transition hover:bg-giallo-scuro lg:flex"
            >
              <Plus className="h-4 w-4" />
              Nuovo sondaggio
            </Link>
          ) : undefined
        }
      />

      {aperti.length === 0 && altri.length === 0 ? (
        <Vuoto
          icona={<MessageSquare className="mx-auto h-12 w-12" aria-hidden="true" />}
          titolo="Nessun sondaggio"
          spiegazione={
            isAdmin
              ? 'Creane uno e i soci potranno rispondere da qui, anche dal telefono.'
              : 'Quando ne viene aperto uno lo trovi qui, con un tasto per rispondere.'
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {aperti.length > 0 && (
            <section>
              <Occhiello>{aperti.length === 1 ? 'Aperto ora' : `Aperti ora (${aperti.length})`}</Occhiello>
              <div className="flex flex-col gap-3">
                {aperti.map((s: any) => (
                  <SchedaSondaggio key={s.id} sondaggio={s} isAdmin={isAdmin} onElimina={deleteMutation.mutate} />
                ))}
              </div>
            </section>
          )}
          {altri.length > 0 && (
            <section>
              <Occhiello>Chiusi e bozze</Occhiello>
              <div className="flex flex-col gap-3">
                {altri.map((s: any) => (
                  <SchedaSondaggio key={s.id} sondaggio={s} isAdmin={isAdmin} onElimina={deleteMutation.mutate} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {isAdmin && (
        <AzionePrincipale>
          <BottoneGrande to="/sondaggi/nuovo">
            <Plus className="h-5 w-5" />
            Nuovo sondaggio
          </BottoneGrande>
        </AzionePrincipale>
      )}
    </Pagina>
  )
}

export default Sondaggi

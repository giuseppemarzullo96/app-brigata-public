import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../services/authService'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { Bell, Calendar, MessageSquare, Plus, Trash2 } from 'lucide-react'
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
 * Avvisi e comunicazioni.
 *
 * Erano tutti uguali, in un elenco unico: letti e non letti mischiati, ognuno
 * con quattro iconcine di azione in alto a destra e il testo intero sotto.
 * Ora i non letti vengono prima e si riconoscono da lontano; gli altri si
 * fanno da parte, perché sono già stati.
 */

const PRIORITA: Record<string, { bordo: string; punto: string; nome: string }> = {
  urgente: { bordo: 'border-red-200', punto: 'bg-red-600', nome: 'Urgente' },
  alta: { bordo: 'border-orange-200', punto: 'bg-orange-600', nome: 'Importante' },
  normale: { bordo: 'border-gray-200', punto: 'bg-primary-600', nome: '' },
}

function SchedaAvviso({
  avviso,
  isAdmin,
  onElimina,
}: {
  avviso: any
  isAdmin: boolean
  onElimina: (id: string) => void
}) {
  const p = PRIORITA[avviso.priorita || 'normale'] || PRIORITA.normale
  const letto = Boolean(avviso.letto)

  return (
    <article className={`rounded-2xl border ${letto ? 'border-gray-200' : p.bordo} bg-white p-4 shadow-sm`}>
      <div className="flex items-center gap-2">
        {!letto && <span className={`h-2 w-2 flex-none rounded-full ${p.punto}`} aria-hidden="true" />}
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
          {format(parseISO(avviso.created_at), 'd MMMM yyyy', { locale: it })}
        </span>
        {!letto && p.nome && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-orange-700">· {p.nome}</span>
        )}
        <span className="flex-1" />
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Eliminare questo avviso? L'operazione non si annulla.")) onElimina(avviso.id)
            }}
            aria-label="Elimina avviso"
            title="Elimina avviso"
            className="-my-2 -mr-2 flex h-11 w-11 flex-none items-center justify-center rounded-xl text-gray-400 transition hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      <Link to={`/avvisi/${avviso.id}`} className="mt-2 block">
        <h3
          className={`text-[15px] leading-snug tracking-tight ${
            letto ? 'font-semibold text-gray-600' : 'font-bold text-gray-900'
          }`}
        >
          {avviso.titolo}
        </h3>
        {!letto && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-gray-500">{avviso.contenuto}</p>
        )}
      </Link>

      {(avviso.assemblea_id || avviso.sondaggio_id) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {avviso.assemblea_id && (
            <Link
              to={`/assemblee/${avviso.assemblea_id}`}
              className="flex min-h-[40px] items-center gap-2 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <Calendar className="h-4 w-4" aria-hidden="true" />
              Vai all'assemblea
            </Link>
          )}
          {avviso.sondaggio_id && (
            <Link
              to={`/sondaggi/${avviso.sondaggio_id}`}
              className="flex min-h-[40px] items-center gap-2 rounded-xl border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              Vai al sondaggio
            </Link>
          )}
        </div>
      )}
    </article>
  )
}

const Avvisi = () => {
  const { user } = useAuth()
  const isAdmin = user?.ruolo === 'admin'
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['avvisi'],
    queryFn: async () => (await api.get('/avvisi')).data,
  })

  const deleteMutation = useMutation({
    mutationFn: async (avvisoId: string) => {
      await api.delete(`/avvisi/${avvisoId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avvisi'] })
      queryClient.invalidateQueries({ queryKey: ['avvisi', 'non-letti-count'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Avviso eliminato')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Errore durante l'eliminazione")
    },
  })

  const { nonLetti, letti } = useMemo(() => {
    const tutti = data?.avvisi || []
    return {
      nonLetti: tutti.filter((a: any) => !a.letto),
      letti: tutti.filter((a: any) => a.letto),
    }
  }, [data])

  if (isLoading) return <Caricamento cosa="degli avvisi" />

  const nessuno = nonLetti.length === 0 && letti.length === 0

  return (
    <Pagina azione={isAdmin}>
      <IntestazionePagina
        titolo="Avvisi"
        azioni={
          isAdmin ? (
            <Link
              to="/avvisi/nuovo"
              className="hidden h-11 flex-none items-center gap-2 rounded-xl bg-giallo px-4 text-sm font-semibold text-gray-900 transition hover:bg-giallo-scuro lg:flex"
            >
              <Plus className="h-4 w-4" />
              Nuovo avviso
            </Link>
          ) : undefined
        }
      />

      {nessuno ? (
        <Vuoto
          icona={<Bell className="mx-auto h-12 w-12" aria-hidden="true" />}
          titolo="Nessun avviso"
          spiegazione={
            isAdmin
              ? 'Quando ne pubblichi uno arriva a tutti i soci, anche via WhatsApp.'
              : 'Le comunicazioni dell’associazione compariranno qui.'
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {nonLetti.length > 0 && (
            <section>
              <Occhiello>
                {nonLetti.length === 1 ? 'Da leggere' : `Da leggere (${nonLetti.length})`}
              </Occhiello>
              <div className="flex flex-col gap-2.5">
                {nonLetti.map((a: any) => (
                  <SchedaAvviso key={a.id} avviso={a} isAdmin={isAdmin} onElimina={deleteMutation.mutate} />
                ))}
              </div>
            </section>
          )}

          {letti.length > 0 && (
            <section>
              <Occhiello>Già letti</Occhiello>
              <div className="flex flex-col gap-2.5">
                {letti.map((a: any) => (
                  <SchedaAvviso key={a.id} avviso={a} isAdmin={isAdmin} onElimina={deleteMutation.mutate} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {isAdmin && (
        <AzionePrincipale>
          <BottoneGrande to="/avvisi/nuovo">
            <Plus className="h-5 w-5" />
            Nuovo avviso
          </BottoneGrande>
        </AzionePrincipale>
      )}
    </Pagina>
  )
}

export default Avvisi

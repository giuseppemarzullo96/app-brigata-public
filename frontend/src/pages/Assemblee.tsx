import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../services/authService'
import { format, isBefore, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { CheckCircle, FileText, Mail, MapPin, Plus, Trash2, Users, XCircle } from 'lucide-react'
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
 * Assemblee.
 *
 * Ogni assemblea era un blocco di etichette in grassetto — Data:, Luogo:,
 * Tipo:, Stato: — con l'ordine del giorno aperto sotto e cinque pulsanti in
 * fondo. La domanda che conta, «ci sarai?», stava in mezzo agli altri.
 *
 * Ora quella domanda è la cosa più grande della scheda, e le assemblee
 * passate si fanno da parte.
 */

function SchedaAssemblea({
  assemblea,
  isAdmin,
  onPresenza,
  onConvocazioni,
  onElimina,
  passata,
}: {
  assemblea: any
  isAdmin: boolean
  onPresenza: (id: string, presenza: boolean) => void
  onConvocazioni: (id: string) => void
  onElimina: (id: string) => void
  passata: boolean
}) {
  const data = parseISO(assemblea.data_assemblea)
  const presenti = Number(assemblea.presenti) || 0
  const convocati = Number(assemblea.totale_convocati) || 0
  const risposto = assemblea.mia_presenza

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline gap-2">
        <span className="iniziale-maiuscola text-xl font-bold leading-none tracking-tight text-gray-900">
          {format(data, 'EEEE d', { locale: it })}
        </span>
        <span className="text-sm font-semibold text-gray-500">{format(data, 'MMMM yyyy', { locale: it })}</span>
      </div>

      <h3 className="mt-2 text-[15px] font-semibold leading-snug text-gray-900">{assemblea.titolo}</h3>

      <div className="mt-2.5 flex flex-col gap-1 text-sm text-gray-500">
        <span>{format(data, 'HH:mm')}</span>
        {assemblea.luogo && (
          <span className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            {assemblea.luogo}
          </span>
        )}
        {convocati > 0 && (
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4 flex-none" aria-hidden="true" />
            {presenti} confermati su {convocati}
          </span>
        )}
      </div>

      {!passata && !isAdmin && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold text-gray-700">Ci sarai?</p>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => onPresenza(assemblea.id, true)}
              aria-pressed={risposto === true}
              className={`flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-bold transition ${
                risposto === true
                  ? 'border-2 border-emerald-700 bg-emerald-50 text-emerald-800'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <CheckCircle className="h-[18px] w-[18px]" aria-hidden="true" />
              Ci sarò
            </button>
            <button
              type="button"
              onClick={() => onPresenza(assemblea.id, false)}
              aria-pressed={risposto === false}
              className={`flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition ${
                risposto === false
                  ? 'border-2 border-gray-400 bg-gray-100 text-gray-800'
                  : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <XCircle className="h-[18px] w-[18px]" aria-hidden="true" />
              Non posso
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">Puoi cambiare idea fino all'inizio.</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to={`/assemblee/${assemblea.id}`}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          {passata ? 'Verbale e presenze' : 'Ordine del giorno'}
        </Link>
        {isAdmin && !passata && (
          <button
            type="button"
            onClick={() => onConvocazioni(assemblea.id)}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            Convoca
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => {
              if (
                confirm('Eliminare questa assemblea? Spariscono anche le convocazioni e le presenze già registrate.')
              ) {
                onElimina(assemblea.id)
              }
            }}
            aria-label="Elimina assemblea"
            title="Elimina assemblea"
            className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-gray-400 transition hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>
    </article>
  )
}

const Assemblee = () => {
  const { user } = useAuth()
  const isAdmin = user?.ruolo === 'admin'
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['assemblee'],
    queryFn: async () => (await api.get('/assemblee')).data,
  })

  const inviaConvocazioniMutation = useMutation({
    mutationFn: async (assembleaId: string) => {
      await api.post(`/assemblee/${assembleaId}/invia-convocazioni`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assemblee'] })
      toast.success('Convocazioni inviate')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Errore durante l'invio delle convocazioni")
    },
  })

  const registraPresenzaMutation = useMutation({
    mutationFn: async ({ assembleaId, presenza }: { assembleaId: string; presenza: boolean }) => {
      await api.put(`/assemblee/${assembleaId}/presenza`, { presenza })
    },
    onSuccess: (_d, variabili) => {
      queryClient.invalidateQueries({ queryKey: ['assemblee'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(variabili.presenza ? 'Segnato: ci sarai' : 'Segnato: non ci sarai')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la registrazione')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (assembleaId: string) => {
      await api.delete(`/assemblee/${assembleaId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assemblee'] })
      toast.success('Assemblea eliminata')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Errore durante l'eliminazione")
    },
  })

  const { prossime, passate } = useMemo(() => {
    const tutte = data?.assemblee || []
    const adesso = new Date()
    return {
      prossime: tutte.filter((a: any) => !isBefore(parseISO(a.data_assemblea), adesso)),
      passate: tutte.filter((a: any) => isBefore(parseISO(a.data_assemblea), adesso)),
    }
  }, [data])

  if (isLoading) return <Caricamento cosa="delle assemblee" />

  const handleConvocazioni = (id: string) => {
    if (confirm("Inviare la convocazione a tutti i soci? Parte una email e un messaggio WhatsApp.")) {
      inviaConvocazioniMutation.mutate(id)
    }
  }

  return (
    <Pagina azione={isAdmin}>
      <IntestazionePagina
        titolo="Assemblee"
        azioni={
          isAdmin ? (
            <Link
              to="/assemblee/nuova"
              className="hidden h-11 flex-none items-center gap-2 rounded-xl bg-giallo px-4 text-sm font-semibold text-gray-900 transition hover:bg-giallo-scuro lg:flex"
            >
              <Plus className="h-4 w-4" />
              Nuova assemblea
            </Link>
          ) : undefined
        }
      />

      {prossime.length === 0 && passate.length === 0 ? (
        <Vuoto
          icona={<FileText className="mx-auto h-12 w-12" aria-hidden="true" />}
          titolo="Nessuna assemblea"
          spiegazione={
            isAdmin
              ? 'Creane una e invia le convocazioni: arrivano per email e su WhatsApp.'
              : 'Quando ne viene convocata una la trovi qui, con la conferma di presenza.'
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {prossime.length > 0 && (
            <section>
              <Occhiello>In programma</Occhiello>
              <div className="flex flex-col gap-3">
                {prossime.map((a: any) => (
                  <SchedaAssemblea
                    key={a.id}
                    assemblea={a}
                    isAdmin={isAdmin}
                    passata={false}
                    onPresenza={(id, presenza) => registraPresenzaMutation.mutate({ assembleaId: id, presenza })}
                    onConvocazioni={handleConvocazioni}
                    onElimina={deleteMutation.mutate}
                  />
                ))}
              </div>
            </section>
          )}

          {passate.length > 0 && (
            <section>
              <Occhiello>Passate</Occhiello>
              <div className="flex flex-col gap-3">
                {passate.map((a: any) => (
                  <SchedaAssemblea
                    key={a.id}
                    assemblea={a}
                    isAdmin={isAdmin}
                    passata
                    onPresenza={(id, presenza) => registraPresenzaMutation.mutate({ assembleaId: id, presenza })}
                    onConvocazioni={handleConvocazioni}
                    onElimina={deleteMutation.mutate}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {isAdmin && (
        <AzionePrincipale>
          <BottoneGrande to="/assemblee/nuova">
            <Plus className="h-5 w-5" />
            Nuova assemblea
          </BottoneGrande>
        </AzionePrincipale>
      )}
    </Pagina>
  )
}

export default Assemblee

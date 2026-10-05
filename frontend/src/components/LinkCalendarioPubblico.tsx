import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Copy, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../services/authService'

/**
 * Il link al calendario in sola lettura, da mandare a chi non ha un account.
 * Cambiarlo rende inutile quello vecchio: e' il modo di "ritirarlo" se gira
 * dove non dovrebbe.
 */
export default function LinkCalendarioPubblico() {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['calendario-pubblico'],
    queryFn: async () => (await api.get('/impostazioni/calendario-pubblico')).data,
  })

  const aggiorna = (dati: any) => queryClient.setQueryData(['calendario-pubblico'], dati)
  const creaMutation = useMutation({
    mutationFn: async () => (await api.post('/impostazioni/calendario-pubblico')).data,
    onSuccess: (dati) => {
      aggiorna(dati)
      toast.success(data?.attivo ? 'Link cambiato: quello vecchio non funziona più' : 'Link creato')
    },
    onError: () => toast.error('Non sono riuscito a creare il link'),
  })
  const disattivaMutation = useMutation({
    mutationFn: async () => (await api.delete('/impostazioni/calendario-pubblico')).data,
    onSuccess: (dati) => {
      aggiorna(dati)
      toast.success('Link disattivato')
    },
    onError: () => toast.error('Non sono riuscito a disattivare il link'),
  })

  const url = data?.codice ? `${window.location.origin}/calendario/${data.codice}` : ''
  const occupato = creaMutation.isPending || disattivaMutation.isPending

  const copia = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiato')
    } catch {
      toast.error('Copia non riuscita: tieni premuto sul link per copiarlo')
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-gray-500" aria-hidden="true" />
        <h2 className="text-base font-semibold text-gray-900">Calendario pubblico</h2>
      </div>
      <p className="text-sm leading-relaxed text-gray-500">
        Una pagina con i turni mese per mese, da mandare a chi non ha un account: la vede chiunque abbia il
        link, senza accedere. Mostra chi porta cosa con nome e cognome; niente telefoni, email o note.
      </p>

      {data?.attivo ? (
        <>
          <p className="mt-4 break-all rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 font-mono text-[13px] text-gray-700 select-all">
            {url}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={copia} className="btn btn-primary">
              <Copy className="h-4 w-4" />
              Copia
            </button>
            <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary">
              <ExternalLink className="h-4 w-4" />
              Apri
            </a>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={occupato}
              onClick={() => {
                if (confirm('Cambiare il link? Quello di adesso smetterà di funzionare per tutti quelli che l\'hanno ricevuto.')) creaMutation.mutate()
              }}
              className="btn btn-secondary text-sm"
            >
              Cambia link
            </button>
            <button
              type="button"
              disabled={occupato}
              onClick={() => {
                if (confirm('Disattivare il calendario pubblico? Il link smetterà di funzionare.')) disattivaMutation.mutate()
              }}
              className="btn text-sm text-red-700 hover:bg-red-50"
            >
              Disattiva
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={occupato || !data}
          onClick={() => creaMutation.mutate()}
          className="btn btn-primary mt-4 w-full"
        >
          {creaMutation.isPending ? 'Creo il link…' : 'Crea il link'}
        </button>
      )}
    </section>
  )
}

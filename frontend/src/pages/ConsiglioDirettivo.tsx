import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Landmark, Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../services/authService'
import { useAuth } from '../contexts/AuthContext'

/**
 * Composizione del Consiglio direttivo. Tutti i soci la vedono (art. 4 dello
 * Statuto); solo gli admin la modificano. Da qui dipende chi vede le riunioni
 * del Consiglio e i loro verbali.
 */

const CARICHE: Record<string, string> = {
  presidente: 'Presidente',
  vicepresidente: 'Vicepresidente',
  segretario: 'Segretario',
  consigliere: 'Consigliere',
}

const data = (d: string | null) => (d ? format(new Date(d), 'd MMMM yyyy', { locale: it }) : '')
const oggi = () => format(new Date(), 'yyyy-MM-dd')

const ConsiglioDirettivo = () => {
  const { user } = useAuth()
  const isAdmin = user?.ruolo === 'admin'
  const queryClient = useQueryClient()
  const [storico, setStorico] = useState(false)
  const [nuova, setNuova] = useState({ user_id: '', carica: 'consigliere', dal: oggi() })

  const { data: caricheData, isLoading } = useQuery({
    queryKey: ['cariche', storico],
    queryFn: async () => (await api.get('/cariche', { params: storico ? { tutte: 1 } : {} })).data,
  })

  const { data: sociData } = useQuery({
    queryKey: ['soci-per-cariche'],
    queryFn: async () => (await api.get('/users', { params: { fittizio: 'false' } })).data,
    enabled: isAdmin,
  })
  const soci = (sociData?.users || []).filter((u: any) => !u.fittizio && u.ruolo !== 'esterno')

  const invalida = () => queryClient.invalidateQueries({ queryKey: ['cariche'] })
  const errore = (e: any) => toast.error(e.response?.data?.error || 'Operazione non riuscita')

  const crea = useMutation({
    mutationFn: async () => (await api.post('/cariche', nuova)).data,
    onSuccess: () => {
      invalida()
      setNuova({ user_id: '', carica: 'consigliere', dal: oggi() })
      toast.success('Carica registrata')
    },
    onError: errore,
  })

  const chiudi = useMutation({
    mutationFn: async ({ id, al }: { id: string; al: string }) => (await api.put(`/cariche/${id}`, { al })).data,
    onSuccess: () => { invalida(); toast.success('Mandato chiuso') },
    onError: errore,
  })

  const elimina = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/cariche/${id}`)).data,
    onSuccess: () => { invalida(); toast.success('Carica eliminata') },
    onError: errore,
  })

  const cariche: any[] = caricheData?.cariche || []

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2">
        <Landmark className="w-6 h-6" />
        Consiglio direttivo
      </h1>
      <p className="text-sm text-gray-600 mb-6">
        Da 3 a 7 componenti eletti dall'assemblea per tre anni (art. 10); Presidente e Vicepresidente li
        elegge il Consiglio nella prima seduta (art. 11). Le riunioni del Consiglio e i loro verbali sono
        visibili solo ai consiglieri.
      </p>

      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{storico ? 'Tutte le cariche' : 'In carica'}</h2>
          <label className="text-sm text-gray-600 flex items-center gap-2">
            <input type="checkbox" checked={storico} onChange={(e) => setStorico(e.target.checked)} />
            Mostra lo storico
          </label>
        </div>

        {isLoading && <p className="text-sm text-gray-500">Caricamento…</p>}
        {!isLoading && cariche.length === 0 && (
          <p className="text-sm text-gray-500">
            Nessuna carica registrata.{isAdmin && ' Aggiungi i consiglieri qui sotto, oppure registra gli eletti dalla pagina della votazione.'}
          </p>
        )}

        <div className="divide-y divide-gray-100">
          {cariche.map((c) => (
            <div key={c.id} className="py-3 flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[12rem]">
                <p className={`font-medium ${c.in_carica ? 'text-gray-900' : 'text-gray-500'}`}>
                  {c.cognome} {c.nome}
                  <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                    {CARICHE[c.carica] || c.carica}
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  dal {data(c.dal)}{c.al ? ` al ${data(c.al)}` : ''}
                  {c.votazione_titolo && ` · eletto con «${c.votazione_titolo}»`}
                </p>
              </div>
              {isAdmin && !c.al && (
                <button
                  className="btn btn-secondary text-xs"
                  onClick={() => {
                    const al = prompt('Data di fine del mandato (AAAA-MM-GG)', oggi())
                    if (al) chiudi.mutate({ id: c.id, al })
                  }}
                >
                  Chiudi mandato
                </button>
              )}
              {isAdmin && (
                <button
                  className="btn btn-secondary text-xs text-red-600"
                  onClick={() => {
                    if (confirm('Eliminare questa carica? Usalo solo per correggere un errore: un mandato concluso si chiude, non si elimina.')) {
                      elimina.mutate(c.id)
                    }
                  }}
                >
                  Elimina
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {isAdmin && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Aggiungi una carica</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select className="input w-full" value={nuova.user_id}
              onChange={(e) => setNuova({ ...nuova, user_id: e.target.value })}>
              <option value="">Socio…</option>
              {soci.map((u: any) => <option key={u.id} value={u.id}>{u.cognome} {u.nome}</option>)}
            </select>
            <select className="input w-full" value={nuova.carica}
              onChange={(e) => setNuova({ ...nuova, carica: e.target.value })}>
              {Object.entries(CARICHE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input type="date" className="input w-full" value={nuova.dal}
              onChange={(e) => setNuova({ ...nuova, dal: e.target.value })} />
          </div>
          <button className="btn btn-primary text-sm mt-3" onClick={() => crea.mutate()}
            disabled={!nuova.user_id || !nuova.dal || crea.isPending}>
            <Plus className="w-4 h-4 mr-1 inline" />
            Aggiungi
          </button>
        </div>
      )}
    </div>
  )
}

export default ConsiglioDirettivo

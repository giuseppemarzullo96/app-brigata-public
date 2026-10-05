import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, FileDown, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../services/authService'
import { scaricaFile } from '../services/scarica'

/**
 * Verbale di una riunione del Consiglio direttivo: dati della seduta,
 * consiglieri presenti e delibere. Solo admin. Le regole dell'art. 10.2
 * (maggioranza dei componenti, niente deleghe) le verifica il server.
 */

interface Delibera {
  oggetto: string
  testo: string
  favorevoli: string
  contrari: string
  astenuti: string
}

const CARICHE: Record<string, string> = {
  presidente: 'Presidente',
  vicepresidente: 'Vicepresidente',
  segretario: 'Segretario',
  consigliere: 'Consigliere',
}

const CAMPI = ['numero_verbale', 'presidente', 'segretario', 'luogo', 'data_convocazione',
  'mezzo_convocazione', 'ora_inizio', 'ora_chiusura', 'invitati', 'note'] as const
type Campo = typeof CAMPI[number]

const VerbaleConsiglio = ({ assembleaId, titolo }: { assembleaId: string; titolo: string }) => {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<Record<Campo, string>>(
    Object.fromEntries(CAMPI.map((c) => [c, ''])) as Record<Campo, string>
  )
  const [presenti, setPresenti] = useState<string[]>([])
  const [delibere, setDelibere] = useState<Delibera[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['assemblea', assembleaId, 'verbale-consiglio'],
    queryFn: async () => (await api.get(`/assemblee/${assembleaId}/dati-verbale-consiglio`)).data,
  })

  useEffect(() => {
    if (!data) return
    const d = data.dati || {}
    setForm(Object.fromEntries(CAMPI.map((c) => [c, d[c] || ''])) as Record<Campo, string>)
    setPresenti((d.consiglieri || []).filter((c: any) => c.presente).map((c: any) => c.user_id))
    setDelibere((d.delibere || []).map((x: any) => ({
      oggetto: x.oggetto || '',
      testo: x.testo || '',
      favorevoli: String(x.favorevoli ?? ''),
      contrari: String(x.contrari ?? ''),
      astenuti: String(x.astenuti ?? ''),
    })))
  }, [data])

  const salva = useMutation({
    mutationFn: async () =>
      (await api.put(`/assemblee/${assembleaId}/dati-verbale-consiglio`, {
        ...form,
        presenti,
        delibere,
      })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assemblea', assembleaId] })
      toast.success('Verbale del Consiglio salvato')
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Errore durante il salvataggio'),
  })

  if (isLoading || !data) return <p className="text-sm text-gray-500">Caricamento…</p>

  const consiglieri: any[] = data.consiglieri || []
  const imposta = (campo: Campo, valore: string) => setForm((f) => ({ ...f, [campo]: valore }))
  const cambiaDelibera = (i: number, campo: keyof Delibera, valore: string) =>
    setDelibere((ds) => ds.map((d, j) => (j === i ? { ...d, [campo]: valore } : d)))
  const maggioranza = presenti.length * 2 > consiglieri.length

  const input = (campo: Campo, label: string, tipo = 'text', placeholder = '') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={tipo} className="input w-full" placeholder={placeholder} value={form[campo]}
        onChange={(e) => imposta(campo, e.target.value)} />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {input('presidente', 'Presiede')}
        {input('segretario', 'Segretario verbalizzante')}
        {input('numero_verbale', 'Numero del verbale', 'text', 'es. 5/2026')}
        {input('luogo', 'Luogo')}
        {input('data_convocazione', 'Convocazione inviata il', 'date')}
        {input('mezzo_convocazione', 'Inviata tramite', 'text', 'es. WhatsApp ed email')}
        {input('ora_inizio', 'Inizio', 'time')}
        {input('ora_chiusura', 'Chiusura', 'time')}
        <div className="sm:col-span-2">
          {input('invitati', 'Partecipano senza diritto di voto (facoltativo)')}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Consiglieri presenti</h3>
        <p className="text-xs text-gray-500 mb-2">
          In carica alla data della riunione. Nel Consiglio non sono ammesse deleghe (art. 10.2).
        </p>
        {consiglieri.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            Nessun consigliere in carica a questa data: registra prima la composizione del Consiglio.
          </p>
        ) : (
          <div className="space-y-1">
            {consiglieri.map((c) => (
              <label key={c.user_id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={presenti.includes(c.user_id)}
                  onChange={(e) => setPresenti((p) => e.target.checked
                    ? [...p, c.user_id] : p.filter((x) => x !== c.user_id))} />
                {c.cognome} {c.nome}
                <span className="text-xs text-gray-500">{CARICHE[c.carica] || c.carica}</span>
              </label>
            ))}
            <p className={`text-xs mt-1 ${maggioranza ? 'text-green-700' : 'text-red-600'}`}>
              Presenti {presenti.length} su {consiglieri.length}
              {maggioranza ? ': riunione valida' : ': manca la maggioranza dei componenti'}
            </p>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Delibere</h3>
        <div className="space-y-4">
          {delibere.map((d, i) => (
            <div key={i} className="border border-gray-200 rounded p-3 space-y-2">
              <div className="flex gap-2 items-start">
                <span className="text-sm font-medium text-gray-700 pt-2">{i + 1}.</span>
                <input className="input w-full" placeholder="Oggetto della delibera" value={d.oggetto}
                  onChange={(e) => cambiaDelibera(i, 'oggetto', e.target.value)} />
                <button className="btn btn-secondary text-sm" title="Rimuovi"
                  onClick={() => setDelibere((ds) => ds.filter((_, j) => j !== i))}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <textarea className="input w-full" rows={3} placeholder="Discussione e testo della delibera"
                value={d.testo} onChange={(e) => cambiaDelibera(i, 'testo', e.target.value)} />
              <div className="grid grid-cols-3 gap-2">
                {(['favorevoli', 'contrari', 'astenuti'] as const).map((campo) => (
                  <div key={campo}>
                    <label className="block text-xs text-gray-600 mb-1 capitalize">{campo}</label>
                    <input type="number" min={0} className="input w-full" value={d[campo]}
                      onChange={(e) => cambiaDelibera(i, campo, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button className="btn btn-secondary text-sm mt-2"
          onClick={() => setDelibere((ds) => [...ds,
            { oggetto: '', testo: '', favorevoli: String(presenti.length), contrari: '0', astenuti: '0' }])}>
          <Plus className="w-4 h-4 mr-1 inline" />
          Aggiungi delibera
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Varie ed eventuali (facoltativo)</label>
        <textarea className="input w-full" rows={3} value={form.note}
          onChange={(e) => imposta('note', e.target.value)} />
      </div>

      {!maggioranza && consiglieri.length > 0 && (
        <p className="text-xs text-red-600 flex gap-1">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Senza la maggioranza dei componenti la riunione non è valida: il verbale lo riporterà.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary text-sm" onClick={() => salva.mutate()} disabled={salva.isPending}>
          {salva.isPending ? 'Salvataggio…' : 'Salva verbale'}
        </button>
        <button className="btn btn-secondary text-sm"
          onClick={() => scaricaFile(`/assemblee/${assembleaId}/verbale-consiglio`, `verbale-consiglio-${titolo}.pdf`)}>
          <FileDown className="w-4 h-4 mr-1 inline" />
          Scarica verbale PDF
        </button>
      </div>
    </div>
  )
}

export default VerbaleConsiglio

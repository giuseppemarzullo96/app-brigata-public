import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ClipboardList } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../services/authService'
import AllegatiVerbale from './AllegatiVerbale'

/**
 * Dati della seduta e registro presenze per il verbale d'assemblea della
 * votazione. Solo admin, a urne aperte o chiuse. Le regole dello statuto
 * (deleghe, quorum, numero dei consiglieri) le verifica il server.
 */

type Presenza = '' | 'in_sala' | 'collegato' | 'delega' | 'assente'

interface RigaRegistro {
  user_id: string
  cognome: string
  nome: string
  presenza: Presenza | null
  delegato_user_id: string | null
  ha_votato: boolean
  quota_in_regola: boolean
}

interface DatiVerbale {
  numero_verbale: string
  codice_fiscale: string
  convocazione: '' | 'prima' | 'seconda'
  data_convocazione: string
  mezzo_convocazione: string
  luogo: string
  ora_inizio: string
  ora_chiusura: string
  presidente: string
  segretario: string
  scrutatori: string
  componenti_consiglio: string
  rinnovo_parziale: boolean
  scadenza_mandato: string
  approvazione_voto_app: '' | 'unanimita' | 'maggioranza'
  note: string
}

const VUOTI: DatiVerbale = {
  numero_verbale: '',
  codice_fiscale: '',
  // Per convenzione le assemblee sono in seconda convocazione.
  convocazione: 'seconda',
  data_convocazione: '',
  mezzo_convocazione: '',
  luogo: '',
  ora_inizio: '',
  ora_chiusura: '',
  presidente: '',
  segretario: '',
  scrutatori: '',
  componenti_consiglio: '',
  rinnovo_parziale: false,
  scadenza_mandato: '',
  approvazione_voto_app: '',
  note: '',
}

const ETICHETTE: Record<Exclude<Presenza, ''>, string> = {
  in_sala: 'Di persona',
  collegato: 'A distanza',
  delega: 'Per delega',
  assente: 'Assente',
}

const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    {children}
  </div>
)

const DatiVerbaleVotazione = ({ votazioneId }: { votazioneId: string }) => {
  const queryClient = useQueryClient()
  const [aperto, setAperto] = useState(false)
  const [form, setForm] = useState<DatiVerbale>(VUOTI)
  const [registro, setRegistro] = useState<RigaRegistro[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['votazione-dati-verbale', votazioneId],
    queryFn: async () => (await api.get(`/votazioni/${votazioneId}/dati-verbale`)).data,
    enabled: aperto,
  })

  useEffect(() => {
    if (!data) return
    const d = data.dati || {}
    setForm({
      ...VUOTI,
      ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null)),
      // Il luogo dell'assemblea collegata come proposta iniziale.
      luogo: d.luogo || data.assemblea?.luogo || '',
      scrutatori: (d.scrutatori || []).join(', '),
      componenti_consiglio: d.componenti_consiglio ? String(d.componenti_consiglio) : '',
    })
    setRegistro(data.registro || [])
  }, [data])

  const salva = useMutation({
    mutationFn: async () =>
      (await api.put(`/votazioni/${votazioneId}/dati-verbale`, {
        dati: {
          ...form,
          scrutatori: form.scrutatori.split(',').map((s) => s.trim()).filter(Boolean),
          componenti_consiglio: form.componenti_consiglio === '' ? null : Number(form.componenti_consiglio),
        },
        registro: registro.map((r) => ({
          user_id: r.user_id,
          presenza: r.presenza || null,
          delegato_user_id: r.presenza === 'delega' ? r.delegato_user_id : null,
        })),
      })).data,
    onSuccess: (risposta) => {
      queryClient.setQueryData(['votazione-dati-verbale', votazioneId], (vecchi: any) => ({
        ...vecchi, dati: risposta.dati, registro: risposta.registro, presenze: risposta.presenze,
      }))
      toast.success('Dati del verbale salvati')
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Errore durante il salvataggio'),
  })

  const imposta = <K extends keyof DatiVerbale>(campo: K, valore: DatiVerbale[K]) =>
    setForm((f) => ({ ...f, [campo]: valore }))

  const impostaPresenza = (userId: string, presenza: Presenza) =>
    setRegistro((righe) => righe.map((r) =>
      r.user_id === userId
        ? { ...r, presenza, delegato_user_id: presenza === 'delega' ? r.delegato_user_id : null }
        : r))

  const impostaDelegato = (userId: string, delegato: string) =>
    setRegistro((righe) => righe.map((r) =>
      r.user_id === userId ? { ...r, delegato_user_id: delegato || null } : r))

  // Chi ha votato dall'app era, per forza, presente: segna di persona chi non
  // ha ancora una presenza, lasciando all'admin le correzioni.
  const precompila = () =>
    setRegistro((righe) => righe.map((r) =>
      r.presenza ? r : { ...r, presenza: r.ha_votato ? 'in_sala' : 'assente' }))

  const presentiInProprio = registro.filter((r) => r.presenza === 'in_sala' || r.presenza === 'collegato')
  const presenze = data?.presenze

  if (!aperto) {
    return (
      <button className="btn btn-secondary text-sm" onClick={() => setAperto(true)}>
        <ClipboardList className="w-4 h-4 mr-1 inline" />
        Dati per il verbale e registro presenze
      </button>
    )
  }

  if (isLoading || !data) return <p className="text-sm text-gray-500">Caricamento…</p>

  return (
    <div className="mt-2 pt-4 border-t border-gray-200 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Dati della seduta</h3>
        <p className="text-xs text-gray-500 mb-3">
          Quello che lasci vuoto resta nel PDF come riga da completare a mano.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Presidente dell'assemblea">
            <input className="input w-full" value={form.presidente}
              onChange={(e) => imposta('presidente', e.target.value)} />
          </Campo>
          <Campo label="Segretario verbalizzante">
            <input className="input w-full" value={form.segretario}
              onChange={(e) => imposta('segretario', e.target.value)} />
          </Campo>
          <Campo label="Convocazione">
            <select className="input w-full" value={form.convocazione}
              onChange={(e) => imposta('convocazione', e.target.value as DatiVerbale['convocazione'])}>
              <option value="prima">Prima convocazione</option>
              <option value="seconda">Seconda convocazione</option>
            </select>
          </Campo>
          <Campo label="Numero del verbale">
            <input className="input w-full" placeholder="es. 3/2026" value={form.numero_verbale}
              onChange={(e) => imposta('numero_verbale', e.target.value)} />
          </Campo>
          <Campo label="Avviso di convocazione inviato il">
            <input type="date" className="input w-full" value={form.data_convocazione}
              onChange={(e) => imposta('data_convocazione', e.target.value)} />
          </Campo>
          <Campo label="Inviato tramite">
            <input className="input w-full" placeholder="es. WhatsApp ed email" value={form.mezzo_convocazione}
              onChange={(e) => imposta('mezzo_convocazione', e.target.value)} />
          </Campo>
          <div className="sm:col-span-2">
            <Campo label="Luogo">
              <input className="input w-full" value={form.luogo}
                onChange={(e) => imposta('luogo', e.target.value)} />
            </Campo>
          </div>
          <Campo label="Inizio della seduta">
            <input type="time" className="input w-full" value={form.ora_inizio}
              onChange={(e) => imposta('ora_inizio', e.target.value)} />
          </Campo>
          <Campo label="Chiusura della seduta">
            <input type="time" className="input w-full" value={form.ora_chiusura}
              onChange={(e) => imposta('ora_chiusura', e.target.value)} />
          </Campo>
          <Campo label="Componenti del consiglio (da 3 a 7)">
            <input type="number" min={3} max={7} className="input w-full" value={form.componenti_consiglio}
              onChange={(e) => imposta('componenti_consiglio', e.target.value)} />
          </Campo>
          <Campo label="Voto tramite app approvato">
            <select className="input w-full" value={form.approvazione_voto_app}
              onChange={(e) => imposta('approvazione_voto_app', e.target.value as DatiVerbale['approvazione_voto_app'])}>
              <option value="">—</option>
              <option value="unanimita">All'unanimità dei presenti</option>
              <option value="maggioranza">A maggioranza dei presenti</option>
            </select>
          </Campo>
          <div className="sm:col-span-2 flex items-center gap-2">
            <input id="rinnovo-parziale" type="checkbox" checked={form.rinnovo_parziale}
              onChange={(e) => imposta('rinnovo_parziale', e.target.checked)} />
            <label htmlFor="rinnovo-parziale" className="text-sm text-gray-700">
              Rinnovo parziale: gli eletti scadono con il consiglio in carica (art. 8.5)
            </label>
          </div>
          {form.rinnovo_parziale && (
            <div className="sm:col-span-2">
              <Campo label="Scadenza del mandato del consiglio in carica">
                <input className="input w-full" placeholder="es. l'approvazione del bilancio 2027"
                  value={form.scadenza_mandato}
                  onChange={(e) => imposta('scadenza_mandato', e.target.value)} />
              </Campo>
            </div>
          )}
          <div className="sm:col-span-2">
            <Campo label="Scrutatori (separati da virgola, facoltativo)">
              <input className="input w-full" value={form.scrutatori}
                onChange={(e) => imposta('scrutatori', e.target.value)} />
            </Campo>
          </div>
          <Campo label="Codice fiscale dell'associazione">
            <input className="input w-full" value={form.codice_fiscale}
              onChange={(e) => imposta('codice_fiscale', e.target.value)} />
          </Campo>
          <div className="sm:col-span-2">
            <Campo label="Varie ed eventuali (facoltativo)">
              <textarea className="input w-full" rows={3} value={form.note}
                onChange={(e) => imposta('note', e.target.value)} />
            </Campo>
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-900">Registro presenze</h3>
          <button className="text-xs text-primary-600 underline" onClick={precompila}>
            Segna presenti i votanti
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Ogni socio può rappresentare al massimo due associati, con delega scritta e firmata (art. 9.3).
        </p>

        {presenze && (
          <p className="text-xs text-gray-600 mb-3">
            Aventi diritto {presenze.aventi_diritto} · in regola con la quota {presenze.in_regola} ·
            presenti {presenze.presenti} · votanti {presenze.votanti}
            {presenze.quorum_raggiunto === false && (
              <span className="text-red-600 font-medium"> · quorum di prima convocazione non raggiunto</span>
            )}
          </p>
        )}
        {presenze?.votanti_non_in_regola > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3 flex gap-1">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {presenze.votanti_non_in_regola} votanti non risultano in regola con la quota dell'anno
            (art. 9.1). Verifica i pagamenti prima di firmare il verbale.
          </p>
        )}

        <div className="divide-y divide-gray-100 border border-gray-200 rounded">
          {registro.map((r) => (
            <div key={r.user_id} className="p-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="flex-1 min-w-[10rem]">
                {r.cognome} {r.nome}
                <span className="block text-xs text-gray-500">
                  {r.ha_votato ? 'ha votato' : 'non ha votato'}
                  {!r.quota_in_regola && ' · quota non in regola'}
                </span>
              </span>
              <select className="input text-sm" value={r.presenza || ''}
                onChange={(e) => impostaPresenza(r.user_id, e.target.value as Presenza)}>
                <option value="">—</option>
                {Object.entries(ETICHETTE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {r.presenza === 'delega' && (
                <select className="input text-sm" value={r.delegato_user_id || ''}
                  onChange={(e) => impostaDelegato(r.user_id, e.target.value)}>
                  <option value="">Delegato…</option>
                  {presentiInProprio.filter((p) => p.user_id !== r.user_id).map((p) => (
                    <option key={p.user_id} value={p.user_id}>{p.cognome} {p.nome}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      </div>

      <button className="btn btn-primary text-sm" onClick={() => salva.mutate()} disabled={salva.isPending}>
        {salva.isPending ? 'Salvataggio…' : 'Salva dati del verbale'}
      </button>

      {data.assemblea?.id ? (
        <AllegatiVerbale assembleaId={data.assemblea.id} isAdmin />
      ) : (
        <p className="text-xs text-gray-500">
          Per allegare documenti al verbale, la votazione va collegata a un'assemblea.
        </p>
      )}
    </div>
  )
}

export default DatiVerbaleVotazione

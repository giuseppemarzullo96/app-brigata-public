import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/authService'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  ArrowLeft, CheckCircle2, Lock, Users, FileDown, AlertTriangle, Vote, ShieldCheck, Pencil, Trash2,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import DatiVerbaleVotazione from '../components/DatiVerbaleVotazione'
import toast from 'react-hot-toast'

const VotazioneDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.ruolo === 'admin'
  const queryClient = useQueryClient()

  const [selezionati, setSelezionati] = useState<string[]>([])
  const [schedaBianca, setSchedaBianca] = useState(false)
  const [conferma, setConferma] = useState(false)

  // Modifica della bozza
  const [inModifica, setInModifica] = useState(false)
  const [formTitolo, setFormTitolo] = useState('')
  const [formDescrizione, setFormDescrizione] = useState('')
  const [formSeggi, setFormSeggi] = useState(3)
  const [formPreferenze, setFormPreferenze] = useState(3)
  const [socioScelto, setSocioScelto] = useState('')
  const [nuovoNome, setNuovoNome] = useState('')
  const [nuovoCognome, setNuovoCognome] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['votazione', id],
    queryFn: async () => (await api.get(`/votazioni/${id}`)).data,
    refetchInterval: 20000,
  })

  const votazione = data?.votazione
  const candidati = (data?.candidati || []).filter((c: any) => !c.ritirato)
  const aperta = votazione?.stato === 'aperta'
  const chiusa = votazione?.stato === 'chiusa'

  const { data: affluenza } = useQuery({
    queryKey: ['votazione-affluenza', id],
    queryFn: async () => (await api.get(`/votazioni/${id}/affluenza`)).data,
    enabled: Boolean(isAdmin && votazione && votazione.stato !== 'bozza'),
    refetchInterval: 10000,
  })

  const { data: risultati } = useQuery({
    queryKey: ['votazione-risultati', id],
    queryFn: async () => (await api.get(`/votazioni/${id}/risultati`)).data,
    enabled: Boolean(chiusa),
  })

  const invalida = () => {
    queryClient.invalidateQueries({ queryKey: ['votazione', id] })
    queryClient.invalidateQueries({ queryKey: ['votazione-affluenza', id] })
    queryClient.invalidateQueries({ queryKey: ['votazione-risultati', id] })
    queryClient.invalidateQueries({ queryKey: ['votazioni'] })
  }

  // Elenco soci per aggiungere candidati: serve solo all'admin su una bozza.
  const { data: sociData } = useQuery({
    queryKey: ['soci-per-candidatura'],
    queryFn: async () => (await api.get('/users')).data,
    enabled: Boolean(isAdmin && votazione?.stato === 'bozza'),
  })
  const soci = (sociData?.users || sociData?.soci || []).filter(
    (u: any) => !u.fittizio && u.ruolo !== 'esterno'
  )

  const iniziaModifica = () => {
    setFormTitolo(votazione.titolo)
    setFormDescrizione(votazione.descrizione || '')
    setFormSeggi(votazione.seggi_da_eleggere)
    setFormPreferenze(votazione.preferenze_max)
    setInModifica(true)
  }

  const updateMutation = useMutation({
    mutationFn: async () =>
      (await api.put(`/votazioni/${id}`, {
        titolo: formTitolo,
        descrizione: formDescrizione || null,
        seggi_da_eleggere: formSeggi,
        preferenze_max: formPreferenze,
      })).data,
    onSuccess: () => {
      setInModifica(false)
      invalida()
      toast.success('Votazione aggiornata')
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Errore durante il salvataggio'),
  })

  const addCandidatoMutation = useMutation({
    mutationFn: async (candidato: { user_id: string | null; nome: string; cognome: string }) =>
      (await api.post(`/votazioni/${id}/candidati`, candidato)).data,
    onSuccess: () => {
      setSocioScelto('')
      setNuovoNome('')
      setNuovoCognome('')
      invalida()
      toast.success('Candidato aggiunto')
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Errore durante l\'aggiunta'),
  })

  const removeCandidatoMutation = useMutation({
    mutationFn: async (candidatoId: string) =>
      (await api.delete(`/votazioni/${id}/candidati/${candidatoId}`)).data,
    onSuccess: () => {
      invalida()
      toast.success('Candidato rimosso')
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Errore durante la rimozione'),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => (await api.delete(`/votazioni/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['votazioni'] })
      toast.success('Votazione eliminata')
      navigate('/votazioni')
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Errore durante l\'eliminazione'),
  })

  const apriMutation = useMutation({
    mutationFn: async () => (await api.post(`/votazioni/${id}/apri`)).data,
    onSuccess: (res) => {
      invalida()
      toast.success(`Urne aperte: ${res.aventi_diritto} aventi diritto`)
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Errore durante l\'apertura'),
  })

  const chiudiMutation = useMutation({
    mutationFn: async () => (await api.post(`/votazioni/${id}/chiudi`)).data,
    onSuccess: () => {
      invalida()
      toast.success('Votazione chiusa, risultati disponibili')
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Errore durante la chiusura'),
  })

  const votaMutation = useMutation({
    mutationFn: async () =>
      (await api.post(`/votazioni/${id}/vota`, {
        candidati: schedaBianca ? [] : selezionati,
        scheda_bianca: schedaBianca,
      })).data,
    onSuccess: () => {
      setConferma(false)
      setSelezionati([])
      setSchedaBianca(false)
      invalida()
      toast.success('Voto registrato')
    },
    onError: (e: any) => {
      setConferma(false)
      toast.error(e.response?.data?.error || 'Errore durante la registrazione del voto')
    },
  })

  if (isLoading) return <div>Caricamento votazione...</div>
  if (!votazione) return <div>Votazione non trovata</div>

  const max = votazione.preferenze_max
  const pieno = selezionati.length >= max

  const toggle = (candidatoId: string) => {
    if (schedaBianca) return
    setSelezionati((prec) =>
      prec.includes(candidatoId)
        ? prec.filter((x) => x !== candidatoId)
        : pieno
        ? prec
        : [...prec, candidatoId]
    )
  }

  const scaricaFile = async (percorso: string, nomeFile: string) => {
    try {
      const res = await api.get(percorso, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = nomeFile
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('Errore durante il download')
    }
  }

  const puoVotare = aperta && data.sono_avente_diritto && !data.ho_votato

  return (
    <div className="max-w-3xl">
      <Link to="/votazioni" className="inline-flex items-center text-sm text-gray-600 mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Torna alle votazioni
      </Link>

      <div className="card mb-6">
        <div className="flex justify-between items-start gap-4 mb-3">
          <h1 className="text-2xl font-bold text-gray-900">{votazione.titolo}</h1>
          <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
            {votazione.stato}
          </span>
        </div>

        {votazione.descrizione && (
          <p className="text-sm text-gray-600 mb-4">{votazione.descrizione}</p>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
          <p><strong>Membri da eleggere:</strong> {votazione.seggi_da_eleggere}</p>
          <p><strong>Preferenze esprimibili:</strong> {max}</p>
          {votazione.aperta_at && (
            <p>
              <strong>Aperta:</strong>{' '}
              {format(new Date(votazione.aperta_at), 'd MMM yyyy HH:mm', { locale: it })}
            </p>
          )}
          {votazione.chiusa_at && (
            <p>
              <strong>Chiusa:</strong>{' '}
              {format(new Date(votazione.chiusa_at), 'd MMM yyyy HH:mm', { locale: it })}
            </p>
          )}
        </div>
      </div>

      {/* Pannello amministratore */}
      {isAdmin && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Gestione</h2>

          {votazione.stato === 'bozza' && (
            <>
              {/* Dati della votazione, modificabili finché è in bozza */}
              {inModifica ? (
                <div className="space-y-3 mb-6 pb-6 border-b border-gray-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Titolo</label>
                    <input
                      type="text"
                      className="input w-full"
                      value={formTitolo}
                      onChange={(e) => setFormTitolo(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Descrizione
                    </label>
                    <textarea
                      className="input w-full"
                      rows={3}
                      value={formDescrizione}
                      onChange={(e) => setFormDescrizione(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Membri da rinnovare
                      </label>
                      <input
                        type="number"
                        min={1}
                        className="input w-full"
                        value={formSeggi}
                        onChange={(e) => {
                          const v = Number(e.target.value)
                          setFormSeggi(v)
                          if (formPreferenze > v) setFormPreferenze(v)
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Preferenze per elettore
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={formSeggi}
                        className="input w-full"
                        value={formPreferenze}
                        onChange={(e) => setFormPreferenze(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-primary text-sm"
                      onClick={() => updateMutation.mutate()}
                      disabled={
                        updateMutation.isPending ||
                        !formTitolo.trim() ||
                        formPreferenze > formSeggi
                      }
                    >
                      {updateMutation.isPending ? 'Salvataggio…' : 'Salva modifiche'}
                    </button>
                    <button
                      className="btn btn-secondary text-sm"
                      onClick={() => setInModifica(false)}
                    >
                      Annulla
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-secondary text-sm mb-6" onClick={iniziaModifica}>
                  <Pencil className="w-4 h-4 mr-1 inline" />
                  Modifica titolo, descrizione e seggi
                </button>
              )}

              {/* Gestione candidati */}
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Candidati ({candidati.length})
              </h3>

              {candidati.length === 0 ? (
                <p className="text-sm text-gray-500 mb-3">Nessun candidato inserito.</p>
              ) : (
                <ul className="space-y-1 mb-3">
                  {candidati.map((c: any, i: number) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400 w-5">{i + 1}.</span>
                      <span className="flex-1 text-gray-900">
                        {c.cognome} {c.nome}
                        {c.user_id && <span className="text-xs text-gray-500 ml-2">(socio)</span>}
                      </span>
                      <button
                        className="text-red-600 hover:text-red-800"
                        title="Rimuovi candidato"
                        onClick={() => removeCandidatoMutation.mutate(c.id)}
                        disabled={removeCandidatoMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex gap-2 mb-3">
                <select
                  className="input flex-1"
                  value={socioScelto}
                  onChange={(e) => setSocioScelto(e.target.value)}
                >
                  <option value="">Aggiungi un socio…</option>
                  {soci.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.cognome} {s.nome}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-primary text-sm"
                  disabled={!socioScelto || addCandidatoMutation.isPending}
                  onClick={() => {
                    const s = soci.find((x: any) => x.id === socioScelto)
                    if (s) {
                      addCandidatoMutation.mutate({
                        user_id: s.id,
                        nome: s.nome,
                        cognome: s.cognome,
                      })
                    }
                  }}
                >
                  Aggiungi
                </button>
              </div>

              <div className="flex gap-2 mb-6">
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="Nome (candidato esterno)"
                  value={nuovoNome}
                  onChange={(e) => setNuovoNome(e.target.value)}
                />
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="Cognome"
                  value={nuovoCognome}
                  onChange={(e) => setNuovoCognome(e.target.value)}
                />
                <button
                  className="btn btn-secondary text-sm"
                  disabled={
                    !nuovoNome.trim() || !nuovoCognome.trim() || addCandidatoMutation.isPending
                  }
                  onClick={() =>
                    addCandidatoMutation.mutate({
                      user_id: null,
                      nome: nuovoNome.trim(),
                      cognome: nuovoCognome.trim(),
                    })
                  }
                >
                  Aggiungi
                </button>
              </div>

              {candidati.length > 0 && candidati.length < votazione.seggi_da_eleggere && (
                <p className="text-sm text-amber-600 mb-3">
                  Servono almeno {votazione.seggi_da_eleggere} candidati per assegnare{' '}
                  {votazione.seggi_da_eleggere} seggi.
                </p>
              )}

              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm text-gray-600 mb-3">
                  Con l'apertura l'elenco degli aventi diritto viene congelato e candidati e seggi
                  non saranno più modificabili.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      if (
                        confirm(
                          'Aprire le urne? Dopo l\'apertura non potrai più modificare candidati né seggi.'
                        )
                      ) {
                        apriMutation.mutate()
                      }
                    }}
                    disabled={
                      apriMutation.isPending ||
                      candidati.length === 0 ||
                      candidati.length < votazione.seggi_da_eleggere
                    }
                  >
                    {apriMutation.isPending ? 'Apertura…' : 'Apri le urne'}
                  </button>
                  <button
                    className="btn btn-danger text-sm"
                    onClick={() => {
                      if (confirm('Eliminare definitivamente questa bozza?')) {
                        deleteMutation.mutate()
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4 mr-1 inline" />
                    Elimina bozza
                  </button>
                </div>
              </div>
            </>
          )}

          {aperta && (
            <>
              <div className="flex items-center gap-2 text-sm text-gray-700 mb-3">
                <Users className="w-4 h-4" />
                <span>
                  Affluenza: <strong>{affluenza?.votanti ?? '—'}</strong> su{' '}
                  <strong>{affluenza?.aventi_diritto ?? '—'}</strong>
                  {affluenza ? ` (${affluenza.percentuale}%)` : ''}
                </span>
              </div>

              <div className="flex items-start gap-2 text-sm text-gray-600 bg-gray-50 rounded px-3 py-2 mb-4">
                <ShieldCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  I conteggi per candidato non sono visibili a nessuno, nemmeno a te, finché le
                  urne restano aperte.
                </span>
              </div>

              {affluenza?.non_votanti?.length > 0 && (
                <details className="mb-4">
                  <summary className="text-sm text-gray-700 cursor-pointer">
                    Non hanno ancora votato ({affluenza.non_votanti.length})
                  </summary>
                  <ul className="mt-2 text-sm text-gray-600 space-y-1">
                    {affluenza.non_votanti.map((u: any) => (
                      <li key={u.id}>{u.cognome} {u.nome}</li>
                    ))}
                  </ul>
                </details>
              )}

              <button
                className="btn btn-danger"
                onClick={() => {
                  if (confirm('Chiudere le urne? Dopo la chiusura nessuno potrà più votare.')) {
                    chiudiMutation.mutate()
                  }
                }}
                disabled={chiudiMutation.isPending}
              >
                {chiudiMutation.isPending ? 'Chiusura…' : 'Chiudi le urne e scrutina'}
              </button>
            </>
          )}

          {chiusa && (
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-secondary text-sm"
                onClick={() => scaricaFile(`/votazioni/${id}/verbale`, `verbale-${votazione.titolo}.pdf`)}
              >
                <FileDown className="w-4 h-4 mr-1 inline" />
                Scarica verbale PDF
              </button>
              <button
                className="btn btn-secondary text-sm"
                onClick={() => scaricaFile(`/votazioni/${id}/export`, `risultati-${votazione.titolo}.csv`)}
              >
                <FileDown className="w-4 h-4 mr-1 inline" />
                Esporta CSV
              </button>
            </div>
          )}

          {chiusa && (
            <button
              className="btn btn-secondary text-sm mt-4"
              onClick={async () => {
                if (!confirm('Registrare gli eletti come consiglieri, dal giorno della chiusura delle urne?')) return
                try {
                  const r = (await api.post(`/cariche/da-votazione/${id}`)).data
                  const saltati = (r.saltati || []).map((x: any) => `${x.nome}: ${x.motivo}`).join('\n')
                  toast.success(`Registrati ${r.registrati.length} consiglieri`)
                  if (saltati) alert(`Non registrati:\n${saltati}`)
                } catch (e: any) {
                  toast.error(e.response?.data?.error || 'Registrazione non riuscita')
                }
              }}
            >
              <Users className="w-4 h-4 mr-1 inline" />
              Registra gli eletti nel Consiglio direttivo
            </button>
          )}

          {(aperta || chiusa) && id && (
            <div className="mt-4">
              <DatiVerbaleVotazione votazioneId={id} />
            </div>
          )}
        </div>
      )}

      {/* Scheda di voto */}
      {puoVotare && !conferma && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Scheda di voto</h2>
            <span className={`text-sm font-medium ${pieno ? 'text-amber-600' : 'text-gray-600'}`}>
              {selezionati.length} di {max} preferenze
            </span>
          </div>

          <div className="space-y-2 mb-4">
            {candidati.map((c: any) => {
              const scelto = selezionati.includes(c.id)
              const bloccato = !scelto && (pieno || schedaBianca)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  disabled={bloccato}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded border text-left transition
                    ${scelto ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}
                    ${bloccato ? 'opacity-40 cursor-not-allowed' : 'hover:border-gray-400'}`}
                >
                  <span
                    className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0
                      ${scelto ? 'bg-primary-600 border-primary-600' : 'border-gray-300'}`}
                  >
                    {scelto && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-gray-900 font-medium">
                      {c.cognome} {c.nome}
                    </span>
                    {c.note && <span className="block text-xs text-gray-500">{c.note}</span>}
                  </span>
                </button>
              )
            })}
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
            <input
              type="checkbox"
              checked={schedaBianca}
              onChange={(e) => {
                setSchedaBianca(e.target.checked)
                if (e.target.checked) setSelezionati([])
              }}
            />
            Scheda bianca (non esprimo preferenze)
          </label>

          {pieno && !schedaBianca && (
            <p className="text-sm text-amber-600 mb-4">
              Hai raggiunto il massimo di {max} preferenze. Deseleziona un nome per cambiarlo.
            </p>
          )}

          <button
            className="btn btn-primary w-full"
            disabled={!schedaBianca && selezionati.length === 0}
            onClick={() => setConferma(true)}
          >
            <Vote className="w-4 h-4 mr-2 inline" />
            Prosegui
          </button>
        </div>
      )}

      {/* Conferma irreversibile */}
      {puoVotare && conferma && (
        <div className="card mb-6 border-2 border-amber-400">
          <div className="flex items-start gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Conferma il voto</h2>
              <p className="text-sm text-gray-600">
                Una volta inviato, il voto non può più essere modificato né ritirato.
              </p>
            </div>
          </div>

          {schedaBianca ? (
            <p className="text-gray-900 font-medium mb-4">Stai votando scheda bianca.</p>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-2">Stai votando per:</p>
              <ul className="mb-4 space-y-1">
                {selezionati.map((sid) => {
                  const c = candidati.find((x: any) => x.id === sid)
                  return (
                    <li key={sid} className="text-gray-900 font-medium">
                      • {c?.cognome} {c?.nome}
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          <div className="flex gap-3">
            <button
              className="btn btn-primary flex-1"
              onClick={() => votaMutation.mutate()}
              disabled={votaMutation.isPending}
            >
              {votaMutation.isPending ? 'Invio…' : 'Conferma e vota'}
            </button>
            <button className="btn btn-secondary" onClick={() => setConferma(false)}>
              Torna indietro
            </button>
          </div>
        </div>
      )}

      {aperta && data.ho_votato && (
        <div className="card mb-6 text-center py-8">
          <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
          <p className="text-gray-900 font-medium">Il tuo voto è stato registrato</p>
          <p className="text-sm text-gray-500 mt-1">
            Nessuno può risalire a cosa hai votato, nemmeno gli amministratori.
          </p>
        </div>
      )}

      {aperta && !data.sono_avente_diritto && (
        <div className="card mb-6 text-center py-8">
          <Lock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">Non risulti fra gli aventi diritto di questa votazione.</p>
        </div>
      )}

      {/* Candidati in sola lettura */}
      {!puoVotare && !chiusa && candidati.length > 0 && (
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Candidati ({candidati.length})
          </h2>
          <ul className="space-y-1 text-gray-700">
            {candidati.map((c: any) => (
              <li key={c.id}>• {c.cognome} {c.nome}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Risultati */}
      {chiusa && risultati?.esito && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Risultati</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-6">
            <div>
              <p className="text-gray-500">Aventi diritto</p>
              <p className="text-xl font-bold">{risultati.esito.aventi_diritto}</p>
            </div>
            <div>
              <p className="text-gray-500">Votanti</p>
              <p className="text-xl font-bold">{risultati.esito.votanti}</p>
            </div>
            <div>
              <p className="text-gray-500">Affluenza</p>
              <p className="text-xl font-bold">{risultati.esito.affluenza_percentuale}%</p>
            </div>
            <div>
              <p className="text-gray-500">Schede bianche</p>
              <p className="text-xl font-bold">{risultati.esito.schede_bianche}</p>
            </div>
          </div>

          {risultati.esito.ballottaggio_necessario && (
            <div className="flex items-start gap-2 text-sm bg-amber-50 text-amber-800 rounded px-3 py-3 mb-4">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Ballottaggio necessario</p>
                <p>
                  Per {risultati.esito.seggi_al_ballottaggio} seggio/i si registra parità di
                  preferenze. Il sistema non assegna d'ufficio: decide l'assemblea.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {risultati.esito.risultati.map((r: any) => {
              const massimo = risultati.esito.risultati[0]?.voti || 1
              return (
                <div
                  key={r.id}
                  className={`px-3 py-2 rounded border ${
                    r.eletto
                      ? 'border-green-500 bg-green-50'
                      : r.ballottaggio
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-gray-900">
                      {r.posizione}. {r.cognome} {r.nome}
                      {r.eletto && (
                        <span className="ml-2 text-xs font-semibold text-green-700">ELETTO</span>
                      )}
                      {r.ballottaggio && (
                        <span className="ml-2 text-xs font-semibold text-amber-700">
                          BALLOTTAGGIO
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-gray-700">
                      {r.voti} ({r.percentuale_votanti}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded overflow-hidden">
                    <div
                      className={`h-full ${r.eletto ? 'bg-green-500' : 'bg-gray-400'}`}
                      style={{ width: `${massimo > 0 ? (r.voti / massimo) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <button
            className="btn btn-secondary text-sm mt-6"
            onClick={() => scaricaFile(`/votazioni/${id}/verbale`, `verbale-${votazione.titolo}.pdf`)}
          >
            <FileDown className="w-4 h-4 mr-1 inline" />
            Scarica il verbale
          </button>
        </div>
      )}
    </div>
  )
}

export default VotazioneDetail

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/authService'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { MessageSquare, BarChart3, CheckCircle, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { useState, useEffect } from 'react'

const SondaggioDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.ruolo === 'admin'
  const [rispostaSelezionata, setRispostaSelezionata] = useState<string>('')
  const [risposteSelezionate, setRisposteSelezionate] = useState<string[]>([])

  const { data, isLoading } = useQuery({
    queryKey: ['sondaggio', id],
    queryFn: async () => {
      const response = await api.get(`/sondaggi/${id}`)
      return response.data
    },
  })

  const { data: risultatiData } = useQuery({
    queryKey: ['sondaggio', id, 'risultati'],
    queryFn: async () => {
      const response = await api.get(`/sondaggi/${id}/risultati`)
      return response.data
    },
    enabled: isAdmin || data?.sondaggio?.risultati_visibili,
  })

  const rispondiMutation = useMutation({
    mutationFn: async () => {
      const sondaggio = data?.sondaggio
      if (sondaggio?.tipo_sondaggio === 'scelta_multipla') {
        if (sondaggio.permetti_multiple_risposte) {
          // Risposte multiple
          await api.post(`/sondaggi/${id}/rispondi`, { opzione_ids: risposteSelezionate })
        } else {
          // Risposta singola
          await api.post(`/sondaggi/${id}/rispondi`, { opzione_id: rispostaSelezionata })
        }
      } else if (sondaggio?.tipo_sondaggio === 'testo_libero') {
        await api.post(`/sondaggi/${id}/rispondi`, { risposta_testo: rispostaSelezionata })
      } else {
        await api.post(`/sondaggi/${id}/rispondi`, { opzione_id: rispostaSelezionata })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sondaggio', id] })
      toast.success('Risposta registrata!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la registrazione')
    },
  })

  const pubblicaMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/sondaggi/${id}/pubblica`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sondaggio', id] })
      queryClient.invalidateQueries({ queryKey: ['sondaggi'] })
      queryClient.invalidateQueries({ queryKey: ['sondaggi', 'aperti'] })
      toast.success('Sondaggio pubblicato!')
    },
  })

  const chiudiMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/sondaggi/${id}/chiudi`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sondaggio', id] })
      queryClient.invalidateQueries({ queryKey: ['sondaggi'] })
      queryClient.invalidateQueries({ queryKey: ['sondaggi', 'aperti'] })
      toast.success('Sondaggio chiuso!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la chiusura')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/sondaggi/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sondaggi'] })
      queryClient.invalidateQueries({ queryKey: ['avvisi'] })
      toast.success('Sondaggio eliminato con successo')
      navigate('/sondaggi')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'eliminazione')
    },
  })

  // Inizializza risposte selezionate se l'utente ha già risposto con multiple risposte
  // Questo hook DEVE essere chiamato prima di qualsiasi return condizionale
  useEffect(() => {
    const sondaggio = data?.sondaggio
    const rispostaUtente = data?.risposta_utente
    
    if (sondaggio?.permetti_multiple_risposte && rispostaUtente && Array.isArray(rispostaUtente)) {
      setRisposteSelezionate(rispostaUtente.map((r: any) => r.opzione_id).filter(Boolean))
    } else if (rispostaUtente && !Array.isArray(rispostaUtente) && rispostaUtente.opzione_id) {
      setRispostaSelezionata(rispostaUtente.opzione_id)
    }
  }, [data])

  if (isLoading) {
    return <div>Caricamento...</div>
  }

  const sondaggio = data?.sondaggio
  const opzioni = data?.opzioni || []
  const rispostaUtente = data?.risposta_utente
  const risultati = risultatiData

  if (!sondaggio) {
    return <div>Sondaggio non trovato</div>
  }

  const haGiaRisposto = !!rispostaUtente
  const puoRispondere = sondaggio.stato === 'aperto' && !haGiaRisposto

  return (
    <div>
      <button
        onClick={() => navigate('/sondaggi')}
        className="text-primary-600 hover:text-primary-700 mb-4"
      >
        ← Torna ai sondaggi
      </button>

      <div className="card mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{sondaggio.titolo}</h1>
            {sondaggio.descrizione && (
              <p className="text-gray-600 mb-4">{sondaggio.descrizione}</p>
            )}
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="capitalize">{sondaggio.tipo_sondaggio?.replace('_', ' ')}</span>
              <span
                className={`px-2 py-1 rounded text-xs ${
                  sondaggio.stato === 'aperto'
                    ? 'bg-green-100 text-green-800'
                    : sondaggio.stato === 'chiuso'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {sondaggio.stato}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {isAdmin && sondaggio.stato === 'bozza' && (
              <button
                onClick={() => pubblicaMutation.mutate()}
                className="btn btn-primary text-sm"
                disabled={pubblicaMutation.isPending}
              >
                Pubblica
              </button>
            )}
            {isAdmin && sondaggio.stato === 'aperto' && (
              <button
                onClick={() => {
                  if (confirm('Sei sicuro di voler chiudere questo sondaggio? Non sarà più possibile rispondere.')) {
                    chiudiMutation.mutate()
                  }
                }}
                className="btn btn-secondary text-sm"
                disabled={chiudiMutation.isPending}
              >
                Chiudi Sondaggio
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => {
                  if (confirm('Sei sicuro di voler eliminare questo sondaggio? Questa azione non può essere annullata.')) {
                    deleteMutation.mutate()
                  }
                }}
                className="btn btn-danger text-sm flex items-center"
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Elimina
              </button>
            )}
          </div>
        </div>

        {/* Risposta */}
        {puoRispondere && (
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-4">La tua risposta</h3>
            {sondaggio.tipo_sondaggio === 'scelta_multipla' && (
              <div className="space-y-2">
                {sondaggio.permetti_multiple_risposte ? (
                  // Checkbox per risposte multiple
                  opzioni.map((opzione: any) => (
                    <label
                      key={opzione.id}
                      className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        value={opzione.id}
                        checked={risposteSelezionate.includes(opzione.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setRisposteSelezionate([...risposteSelezionate, opzione.id])
                          } else {
                            setRisposteSelezionate(risposteSelezionate.filter(id => id !== opzione.id))
                          }
                        }}
                        className="mr-3"
                      />
                      <span>{opzione.testo_opzione}</span>
                    </label>
                  ))
                ) : (
                  // Radio per risposta singola
                  opzioni.map((opzione: any) => (
                    <label
                      key={opzione.id}
                      className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="radio"
                        name="risposta"
                        value={opzione.id}
                        checked={rispostaSelezionata === opzione.id}
                        onChange={(e) => setRispostaSelezionata(e.target.value)}
                        className="mr-3"
                      />
                      <span>{opzione.testo_opzione}</span>
                    </label>
                  ))
                )}
              </div>
            )}

            {sondaggio.tipo_sondaggio === 'testo_libero' && (
              <textarea
                value={rispostaSelezionata}
                onChange={(e) => setRispostaSelezionata(e.target.value)}
                className="input w-full min-h-[100px]"
                placeholder="Scrivi la tua risposta..."
              />
            )}

            {sondaggio.tipo_sondaggio === 'si_no' && (
              <div className="flex gap-4">
                <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 flex-1">
                  <input
                    type="radio"
                    name="risposta"
                    value="si"
                    checked={rispostaSelezionata === 'si'}
                    onChange={(e) => setRispostaSelezionata(e.target.value)}
                    className="mr-3"
                  />
                  <span>Sì</span>
                </label>
                <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 flex-1">
                  <input
                    type="radio"
                    name="risposta"
                    value="no"
                    checked={rispostaSelezionata === 'no'}
                    onChange={(e) => setRispostaSelezionata(e.target.value)}
                    className="mr-3"
                  />
                  <span>No</span>
                </label>
              </div>
            )}

            <button
              onClick={() => {
                if (sondaggio.permetti_multiple_risposte) {
                  if (risposteSelezionate.length === 0) {
                    toast.error('Seleziona almeno un\'opzione')
                    return
                  }
                } else {
                  if (!rispostaSelezionata) {
                    toast.error('Seleziona un\'opzione')
                    return
                  }
                }
                rispondiMutation.mutate()
              }}
              disabled={rispondiMutation.isPending || 
                (sondaggio.permetti_multiple_risposte ? risposteSelezionate.length === 0 : !rispostaSelezionata)}
              className="btn btn-primary mt-4"
            >
              {rispondiMutation.isPending ? 'Invio...' : 'Invia Risposta'}
            </button>
          </div>
        )}

        {haGiaRisposto && (
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Hai già risposto a questo sondaggio</span>
            </div>
          </div>
        )}
      </div>

      {/* Risultati */}
      {(isAdmin || sondaggio.risultati_visibili) && risultati && (
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Risultati ({risultati.totale_risposte || 0} risposte)
            </h2>
            {isAdmin && (
              <a
                href={`/api/v1/sondaggi/${id}/export?format=csv`}
                className="btn btn-secondary text-sm"
              >
                Export CSV
              </a>
            )}
          </div>

          {sondaggio.tipo_sondaggio === 'scelta_multipla' && risultati.risultati && (
            <div className="space-y-4">
              {risultati.risultati.map((risultato: any) => (
                <div key={risultato.id}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">{risultato.testo_opzione}</span>
                    <span className="text-sm text-gray-600">
                      {risultato.voti} voti ({risultato.percentuale}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-primary-600 h-2 rounded-full"
                      style={{ width: `${risultato.percentuale}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {sondaggio.tipo_sondaggio === 'testo_libero' && risultati.risposte && (
            <div className="space-y-3">
              {risultati.risposte.map((risposta: any, index: number) => (
                <div key={index} className="p-3 bg-gray-50 rounded">
                  <p className="text-sm text-gray-600 mb-1">
                    {risposta.nome} {risposta.cognome} -{' '}
                    {format(new Date(risposta.created_at), 'd MMM yyyy', { locale: it })}
                  </p>
                  <p>{risposta.risposta_testo}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SondaggioDetail


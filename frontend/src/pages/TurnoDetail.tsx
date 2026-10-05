import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/authService'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Check, X, ChefHat, Plus, Trash2, UserPlus, BookMarked, Copy, MessageCircle, Search } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { useState } from 'react'
import Modal from '../components/Modal'
import { FormInput, FormSelect, FormTextarea } from '../components/FormInput'

/** «Chi porta la frutta?», «i dolci?», «l'acqua?». Per «altro» non c'è un nome. */
const COSA_PORTA: Record<string, string> = {
  primi: 'i primi', secondi: 'i secondi', contorni: 'i contorni', dolci: 'i dolci',
  pane: 'il pane', acqua: "l'acqua", frutta: 'la frutta',
}
const cosaPorta = (tipo?: string) => (tipo && COSA_PORTA[tipo.toLowerCase()]) || 'questo posto'

const TurnoDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.ruolo === 'admin'
  // Chi organizza le cucine ha gli stessi poteri dell'admin sui turni, senza
  // accedere al resto del gestionale.
  const canGestireCucine = isAdmin || user?.ruolo === 'gestore_cucine'
  const canManage = canGestireCucine || user?.ruolo === 'socio_volontario'
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false)
  const [isAssegnaModalOpen, setIsAssegnaModalOpen] = useState(false)
  const [isRicettaModalOpen, setIsRicettaModalOpen] = useState(false)
  const [slotDaAssegnare, setSlotDaAssegnare] = useState<any>(null)
  const [mostraCreaFittizio, setMostraCreaFittizio] = useState(false)
  const [nomeFittizio, setNomeFittizio] = useState('')
  const [cercaUtente, setCercaUtente] = useState('')
  const [personaScelta, setPersonaScelta] = useState<string | null>(null)
  const [slotPerRicetta, setSlotPerRicetta] = useState<any>(null)
  const [ricettaScelta, setRicettaScelta] = useState<string | null>(null)
  const [slotForm, setSlotForm] = useState({
    tipo_slot: '',
    numero_porzioni: '',
    note: '',
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['turno', id],
    queryFn: async () => {
      if (!id) {
        throw new Error('ID turno non valido')
      }
      // Valida formato UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(id)) {
        throw new Error('ID turno non valido')
      }
      const response = await api.get(`/turni/${id}`)
      return response.data
    },
    enabled: !!id && id !== 'nuovo' && id !== 'calendario',
    retry: false,
  })


  const { data: usersData } = useQuery({
    queryKey: ['users', 'list'],
    queryFn: async () => {
      const response = await api.get('/users')
      return response.data
    },
  })

  const prenotaMutation = useMutation({
    mutationFn: async (slotId: string) => {
      await api.post(`/turni/${id}/slot/${slotId}/prenota`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turno', id] })
      toast.success('Slot prenotato con successo!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la prenotazione')
    },
  })

  const liberaMutation = useMutation({
    mutationFn: async (slotId: string) => {
      await api.delete(`/turni/${id}/slot/${slotId}/libera`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turno', id] })
      toast.success('Slot liberato con successo!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la liberazione')
    },
  })

  const creaSlotMutation = useMutation({
    mutationFn: async (data: any) => {
      // Prima crea lo slot nel backend
      // Nota: serve endpoint per creare slot, per ora usiamo workaround
      await api.post(`/turni/${id}/slot`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turno', id] })
      toast.success('Slot creato!')
      setIsSlotModalOpen(false)
      setSlotForm({ tipo_slot: '', numero_porzioni: '', note: '' })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la creazione')
    },
  })


  const deleteTurnoMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/turni/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turni'] })
      toast.success('Turno eliminato con successo!')
      navigate('/turni')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'eliminazione')
    },
  })

  const assegnaSlotMutation = useMutation({
    mutationFn: async ({ slotId, userId }: { slotId: string; userId: string | null }) => {
      await api.post(`/turni/${id}/slot/${slotId}/assegna`, { user_id: userId })
    },
    onSuccess: (_data, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['turno', id] })
      toast.success(userId ? 'Slot assegnato con successo!' : 'Posto liberato')
      chiudiAssegna()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'assegnazione')
    },
  })

  const creaFittizioMutation = useMutation({
    mutationFn: async (nome: string) => {
      const slug = nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      const email = `fittizio-${slug}-${Date.now()}@fittizio.labrigataodv.it`
      const password = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
      const res = await api.post('/auth/register', {
        email,
        password,
        nome: '',
        cognome: '',
        categoria_socio: 'esterno',
        tipo_persona: 'giuridica',
        ragione_sociale: nome,
        ruolo: 'esterno',
        fittizio: true,
      })
      return res.data.user
    },
    onSuccess: (newUser: any) => {
      queryClient.invalidateQueries({ queryKey: ['users', 'list'] })
      toast.success(`Ente fittizio "${nomeFittizio}" creato`)
      setMostraCreaFittizio(false)
      setNomeFittizio('')
      if (newUser?.id) {
        handleConfermaAssegnazione(newUser.id)
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la creazione dell\'ente fittizio')
    },
  })

  // Query per ricette globali
  const { data: ricetteGlobali } = useQuery({
    queryKey: ['ricettario', 'globale'],
    queryFn: async () => {
      const res = await api.get('/ricettario?archiviato=false')
      return res.data.ricette || []
    },
  })

  // Mutation per associare ricetta a slot
  const associaRicettaMutation = useMutation({
    mutationFn: async ({ slotId, ricettarioId }: { slotId: string; ricettarioId: string | null }) => {
      await api.post(`/turni/${id}/slot/${slotId}/ricetta`, { ricettario_id: ricettarioId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turno', id] })
      toast.success('Ricetta associata con successo!')
      setIsRicettaModalOpen(false)
      setSlotPerRicetta(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'associazione')
    },
  })

  // Mutation per duplicare slot
  const duplicaSlotMutation = useMutation({
    mutationFn: async (slotId: string) => {
      await api.post(`/turni/${id}/slot/${slotId}/duplica`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turno', id] })
      toast.success('Slot duplicato con successo!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la duplicazione')
    },
  })

  // Mutation per eliminare uno slot aperto di troppo
  const eliminaSlotMutation = useMutation({
    mutationFn: async (slotId: string) => {
      await api.delete(`/turni/${id}/slot/${slotId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turno', id] })
      toast.success('Slot eliminato con successo!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'eliminazione dello slot')
    },
  })

  // Pubblica sul gruppo WhatsApp un sondaggio per ogni pietanza scoperta.
  const pubblicaSondaggiMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/turni/${id}/sondaggi-whatsapp`)
      return res.data
    },
    onSuccess: (dati: any) => {
      const pubblicati = dati?.pubblicati?.length || 0
      const scartati = dati?.scartati || []
      queryClient.invalidateQueries({ queryKey: ['turno', id] })
      if (pubblicati > 0) {
        toast.success(
          pubblicati === 1 ? 'Sondaggio pubblicato sul gruppo' : `${pubblicati} sondaggi pubblicati sul gruppo`
        )
      }
      // Una pietanza non inviata va detta, altrimenti sembra dimenticata.
      scartati.forEach((s: any) => {
        const motivo = s.motivo === 'troppi-posti'
          ? 'ha più di 11 posti liberi, troppi per un sondaggio: scrivilo a mano sul gruppo'
          : `non inviato (${s.motivo})`
        toast(`${s.tipoSlot}: ${motivo}`, { icon: 'ℹ️' })
      })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la pubblicazione dei sondaggi')
    },
  })

  // Tutti gli hook devono essere chiamati prima di qualsiasi return condizionale
  const turno = data?.turno
  const slot = data?.slot || []

  // Raggruppa slot per tipo
  const slotPerTipo = slot.reduce((acc: any, s: any) => {
    if (!acc[s.tipo_slot]) {
      acc[s.tipo_slot] = []
    }
    acc[s.tipo_slot].push(s)
    return acc
  }, {})

  const handleDelete = () => {
    if (
      confirm(
        'Sei sicuro di voler eliminare questo turno? Questa azione eliminerà anche tutti gli slot associati e non può essere annullata.'
      )
    ) {
      deleteTurnoMutation.mutate()
    }
  }

  const handlePrenota = (slotId: string) => {
    if (confirm('Confermi la prenotazione di questo slot?')) {
      prenotaMutation.mutate(slotId)
    }
  }

  const handleLibera = (slotId: string) => {
    if (confirm('Confermi di voler liberare questo slot?')) {
      liberaMutation.mutate(slotId)
    }
  }

  const handleEliminaSlot = (slotId: string) => {
    if (confirm('Eliminare questo slot? Il posto sparisce dal turno e l\'operazione non può essere annullata.')) {
      eliminaSlotMutation.mutate(slotId)
    }
  }

  const handlePubblicaSondaggi = () => {
    const liberi = slot.filter((s: any) => s.stato === 'libero')
    const pietanze = [...new Set(liberi.map((s: any) => s.tipo_slot))]
    if (
      confirm(
        `Pubblicare ${pietanze.length} sondaggi sul gruppo WhatsApp, uno per ogni pietanza scoperta ` +
        `(${pietanze.join(', ')}), per un totale di ${liberi.length} posti?\n\n` +
        'I messaggi li vedranno tutti i membri del gruppo. Chi vota si prende il posto.'
      )
    ) {
      pubblicaSondaggiMutation.mutate()
    }
  }

  const handleCreaSlot = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validazione lato client
    if (!slotForm.tipo_slot || slotForm.tipo_slot.trim() === '') {
      toast.error('Seleziona un tipo di slot')
      return
    }
    
    creaSlotMutation.mutate({
      ...slotForm,
      numero_porzioni: slotForm.numero_porzioni ? parseInt(slotForm.numero_porzioni) : null,
    })
  }


  const handleAssegnaSlot = (slot: any) => {
    setSlotDaAssegnare(slot)
    setPersonaScelta(null)
    setIsAssegnaModalOpen(true)
  }

  function chiudiAssegna() {
    setIsAssegnaModalOpen(false)
    setSlotDaAssegnare(null)
    setMostraCreaFittizio(false)
    setNomeFittizio('')
    setCercaUtente('')
    setPersonaScelta(null)
  }

  const handleConfermaAssegnazione = (userId: string | null) => {
    if (!slotDaAssegnare) return
    assegnaSlotMutation.mutate({ slotId: slotDaAssegnare.id, userId })
  }

  const handleAssociaRicetta = (slot: any) => {
    setSlotPerRicetta(slot)
    setRicettaScelta(slot.ricetta_id || null)
    setIsRicettaModalOpen(true)
  }

  const handleConfermaRicetta = (ricettarioId: string | null) => {
    if (!slotPerRicetta) return
    associaRicettaMutation.mutate({ slotId: slotPerRicetta.id, ricettarioId })
  }

  const handleDuplicaSlot = (slotId: string) => {
    if (confirm('Vuoi duplicare questo slot? Verrà creato un nuovo slot identico (libero).')) {
      duplicaSlotMutation.mutate(slotId)
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Caricamento turno...</div>
  }

  if (error) {
    return (
      <div className="card text-center py-12">
        <p className="text-red-600 mb-4">
          {error instanceof Error ? error.message : 'Errore durante il caricamento del turno'}
        </p>
        <button
          onClick={() => navigate('/turni')}
          className="btn btn-secondary"
        >
          Torna ai turni
        </button>
      </div>
    )
  }

  if (!turno) {
    return (
      <div className="card text-center py-12">
        <p className="text-gray-600 mb-4">Turno non trovato</p>
        <button
          onClick={() => navigate('/turni')}
          className="btn btn-secondary"
        >
          Torna ai turni
        </button>
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/turni')}
        className="mb-2 -ml-1 flex min-h-[44px] items-center px-1 font-semibold text-primary-700 hover:text-primary-800"
      >
        ← Torna ai turni
      </button>

      <div className="card mb-6">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          {format(new Date(turno.data_turno), 'EEEE d MMMM yyyy', { locale: it })}
        </h1>
        <p className="mt-1 text-gray-500">
          <span className="iniziale-maiuscola inline-block">{turno.tipo_turno}</span>
          {turno.numero_porzioni ? ` · ${turno.numero_porzioni} porzioni previste` : ''}
        </p>
        {turno.note_generali && (
          <div className="mt-4 p-4 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-700">{turno.note_generali}</p>
          </div>
        )}
        {/* Eliminare un turno non si annulla: sta in fondo alla scheda, non
            accanto al titolo dove capita il pollice. */}
        {canGestireCucine && (
          <div className="mt-4 flex justify-end border-t border-gray-200 pt-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteTurnoMutation.isPending}
              className="btn text-sm text-red-700 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
              {deleteTurnoMutation.isPending ? 'Elimino…' : 'Elimina turno'}
            </button>
          </div>
        )}
      </div>

      <div>
        {/* Slot */}
        <div>
          <div className="card">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold flex items-center">
                <ChefHat className="w-5 h-5 mr-2" />
                Slot Disponibili
              </h2>
              {canGestireCucine && (
                <div className="flex w-full gap-2 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
                  {slot.some((s: any) => s.stato === 'libero') && (
                    <button
                      onClick={handlePubblicaSondaggi}
                      className="btn btn-secondary text-sm flex items-center"
                      title="Chiedi aiuto sul gruppo WhatsApp per i posti ancora liberi"
                      disabled={pubblicaSondaggiMutation.isPending}
                    >
                      <MessageCircle className="w-4 h-4 mr-1" />
                      {pubblicaSondaggiMutation.isPending ? 'Pubblico...' : 'Chiedi sul gruppo'}
                    </button>
                  )}
                  <button
                    onClick={() => setIsSlotModalOpen(true)}
                    className="btn btn-primary text-sm flex items-center"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Aggiungi Slot
                  </button>
                </div>
              )}
            </div>

            {slot.length === 0 ? (
              <p className="text-gray-500">Nessuno slot configurato per questo turno</p>
            ) : (
              <div className="space-y-6">
                {Object.entries(slotPerTipo).map(([tipo, slots]) => {
                  const slotsArray = slots as any[]
                  return (
                  <div key={tipo}>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3 capitalize flex items-center gap-2">
                      <ChefHat className="w-4 h-4" />
                      {tipo}
                      <span className="text-sm font-normal text-gray-500">
                        ({slotsArray.length} slot{slotsArray.length !== 1 ? 's' : ''})
                      </span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {slotsArray.map((s: any) => {
                        const isAssegnato = s.stato === 'assegnato'
                        const isMioSlot = s.user_id === user?.id

                        return (
                          <div
                            key={s.id}
                            className={`p-4 border-2 rounded-lg ${
                              isAssegnato
                                ? 'border-green-200 bg-green-50'
                                : 'border-gray-200 bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  {isAssegnato ? (
                                    <Check className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <X className="w-4 h-4 text-gray-400" />
                                  )}
                                  <span className="text-xs text-gray-500">Slot #{slotsArray.indexOf(s) + 1}</span>
                                </div>
                              </div>
                            </div>

                            {s.numero_porzioni && (
                              <p className="text-sm text-gray-700 mb-2 font-medium">
                                {s.numero_porzioni} porzioni
                              </p>
                            )}

                            {s.note && (
                              <p className="text-xs text-gray-600 mb-2 italic whitespace-pre-line">{s.note}</p>
                            )}

                            {/* Mostra ricetta associata */}
                            {s.ricetta_id && (
                              <div className="mb-3 p-3 bg-primary-50 border border-primary-200 rounded-xl">
                                <div className="flex items-start gap-2">
                                  <BookMarked className="w-4 h-4 text-primary-700 mt-0.5" />
                                  <div className="flex-1">
                                    <p className="text-xs text-primary-700 mb-1 font-semibold">Ricetta</p>
                                    <p className="text-sm font-semibold text-gray-900">{s.nome_ricetta}</p>
                                    {s.ricetta_descrizione && (
                                      <p className="text-xs text-gray-600 mt-1">{s.ricetta_descrizione}</p>
                                    )}
                                    {s.ricetta_istruzioni && (
                                      <details className="mt-2">
                                        <summary className="text-xs font-semibold text-primary-700 cursor-pointer">Vedi istruzioni</summary>
                                        <p className="text-xs text-gray-700 mt-1 whitespace-pre-wrap">{s.ricetta_istruzioni}</p>
                                      </details>
                                    )}
                                    {s.ricetta_note_alimentari && (
                                      <p className="text-xs text-orange-600 mt-1">
                                        <strong>Note:</strong> {s.ricetta_note_alimentari}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {isAssegnato && (
                              <div className="mb-3 p-2 bg-white rounded border border-green-200">
                                <p className="text-xs text-gray-600 mb-1">Assegnato a:</p>
                                <p className="text-sm font-medium text-gray-900">
                                  {s.volontario_ragione_sociale || `${s.volontario_nome || ''} ${s.volontario_cognome || ''}`.trim()}
                                </p>
                              </div>
                            )}

                            <div className="flex gap-2 mt-3">
                              {!isAssegnato ? (
                                <>
                                  {canManage && (
                                    <button
                                      onClick={() => handlePrenota(s.id)}
                                      className="btn btn-primary flex-1 text-xs"
                                    >
                                      Prenota
                                    </button>
                                  )}
                                  {canGestireCucine && (
                                    <>
                                      <button
                                        onClick={() => handleAssegnaSlot(s)}
                                        className="btn btn-secondary text-xs flex items-center justify-center"
                                        title="Assegna manualmente"
                                      >
                                        <UserPlus className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleAssociaRicetta(s)}
                                        className="btn btn-secondary text-xs flex items-center justify-center"
                                        title="Associa ricetta"
                                      >
                                        <BookMarked className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleDuplicaSlot(s.id)}
                                        className="btn btn-secondary text-xs flex items-center justify-center"
                                        title="Duplica slot"
                                        disabled={duplicaSlotMutation.isPending}
                                      >
                                        <Copy className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleEliminaSlot(s.id)}
                                        className="btn btn-danger text-xs flex items-center justify-center"
                                        title="Elimina slot"
                                        disabled={eliminaSlotMutation.isPending}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </>
                              ) : (
                                <>
                                  {(isMioSlot || canGestireCucine) && (
                                    <button
                                      onClick={() => handleLibera(s.id)}
                                      className="btn btn-secondary flex-1 text-xs"
                                    >
                                      Libera
                                    </button>
                                  )}
                                  {canGestireCucine && (
                                    <>
                                      <button
                                        onClick={() => handleAssegnaSlot(s)}
                                        className="btn btn-secondary text-xs flex items-center justify-center"
                                        title="Riassegna"
                                      >
                                        <UserPlus className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleDuplicaSlot(s.id)}
                                        className="btn btn-secondary text-xs flex items-center justify-center"
                                        title="Duplica slot"
                                        disabled={duplicaSlotMutation.isPending}
                                      >
                                        <Copy className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Modal Crea Slot */}
      <Modal
        isOpen={isSlotModalOpen}
        onClose={() => setIsSlotModalOpen(false)}
        title="Aggiungi Slot"
        size="md"
      >
        <form onSubmit={handleCreaSlot}>
          <FormSelect
            label="Tipo Slot"
            id="tipo_slot"
            value={slotForm.tipo_slot}
            onChange={(e) => setSlotForm({ ...slotForm, tipo_slot: e.target.value })}
            placeholder="Seleziona tipo slot"
            options={[
              { value: 'primi', label: 'Primi' },
              { value: 'secondi', label: 'Secondi' },
              { value: 'contorni', label: 'Contorni' },
              { value: 'dolci', label: 'Dolci' },
              { value: 'pane', label: 'Pane' },
              { value: 'acqua', label: 'Bevande' },
              { value: 'frutta', label: 'Frutta' },
              { value: 'altro', label: 'Altro' },
            ]}
            required
          />

          <FormInput
            label="Numero Porzioni"
            type="number"
            id="numero_porzioni"
            value={slotForm.numero_porzioni}
            onChange={(e) => setSlotForm({ ...slotForm, numero_porzioni: e.target.value })}
            min="1"
          />

          <FormTextarea
            label="Note"
            id="note"
            value={slotForm.note}
            onChange={(e) => setSlotForm({ ...slotForm, note: e.target.value })}
            rows={3}
          />

          <div className="flex gap-4 mt-6">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={creaSlotMutation.isPending}
            >
              {creaSlotMutation.isPending ? 'Creazione...' : 'Crea Slot'}
            </button>
            <button
              type="button"
              onClick={() => setIsSlotModalOpen(false)}
              className="btn btn-secondary"
            >
              Annulla
            </button>
          </div>
        </form>
      </Modal>


      {/* Modal Assegna Slot */}
      {(() => {
        if (!slotDaAssegnare) return null
        const nomeDi = (u: any) => u.ragione_sociale || `${u.nome || ''} ${u.cognome || ''}`.trim()
        const assegnatoA = slotDaAssegnare.volontario_ragione_sociale ||
          `${slotDaAssegnare.volontario_nome || ''} ${slotDaAssegnare.volontario_cognome || ''}`.trim()
        const q = cercaUtente.trim().toLowerCase()
        const persone = (usersData?.users || [])
          .filter((u: any) => u.attivo && u.id !== user?.id && u.id !== slotDaAssegnare.user_id)
          .filter((u: any) => !q || nomeDi(u).toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
          .sort((x: any, y: any) => nomeDi(x).localeCompare(nomeDi(y), 'it'))
        const scelta = persone.find((u: any) => u.id === personaScelta)
        const occupato = assegnaSlotMutation.isPending || creaFittizioMutation.isPending

        return (
          <Modal
            isOpen={isAssegnaModalOpen}
            onClose={chiudiAssegna}
            title={`Chi porta ${cosaPorta(slotDaAssegnare.tipo_slot)}?`}
            sottotitolo={[
              slotDaAssegnare.numero_porzioni ? `${slotDaAssegnare.numero_porzioni} porzioni` : null,
              assegnatoA ? `ora è di ${assegnatoA}` : 'posto libero',
            ].filter(Boolean).join(' · ')}
            size="md"
            piede={
              mostraCreaFittizio ? null : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => scelta && handleConfermaAssegnazione(scelta.id)}
                    disabled={!scelta || occupato}
                    className="btn btn-primary min-h-[52px] w-full text-base"
                  >
                    {assegnaSlotMutation.isPending
                      ? 'Assegno…'
                      : scelta
                        ? `Assegna a ${nomeDi(scelta)}`
                        : 'Scegli una persona'}
                  </button>
                  {assegnatoA && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Togliere il posto a ${assegnatoA}? Tornerà libero.`)) handleConfermaAssegnazione(null)
                      }}
                      disabled={occupato}
                      className="btn w-full text-red-700 hover:bg-red-50"
                    >
                      Libera il posto
                    </button>
                  )}
                </div>
              )
            }
          >
            {!mostraCreaFittizio ? (
              <>
                <div className="relative mb-3">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    value={cercaUtente}
                    onChange={(e) => setCercaUtente(e.target.value)}
                    placeholder="Cerca per nome"
                    aria-label="Cerca per nome"
                    className="input min-h-[48px] pl-11"
                  />
                </div>

                {persone.length > 0 ? (
                  <div role="radiogroup" aria-label="Persone" className="flex flex-col gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200">
                    {persone.map((u: any) => {
                      const attiva = u.id === personaScelta
                      return (
                        <button
                          key={u.id}
                          type="button"
                          role="radio"
                          aria-checked={attiva}
                          onClick={() => setPersonaScelta(attiva ? null : u.id)}
                          className={`flex min-h-[52px] items-center gap-3 px-4 py-2 text-left transition ${
                            attiva ? 'bg-primary-50' : 'bg-white hover:bg-gray-50'
                          }`}
                        >
                          <span
                            className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-sm font-bold ${
                              attiva ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {attiva ? <Check className="h-4 w-4" /> : (nomeDi(u)[0] || '?').toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold text-gray-900">{nomeDi(u)}</span>
                            {u.fittizio && <span className="block text-xs text-gray-500">Ente o utente fittizio</span>}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                    {q ? `Nessuno si chiama «${cercaUtente.trim()}».` : 'Nessuna persona da proporre.'}
                  </p>
                )}

                {/* Chi non è nell'elenco: un ente esterno, una parrocchia, un'associazione. */}
                <button
                  type="button"
                  onClick={() => {
                    setNomeFittizio(cercaUtente.trim())
                    setMostraCreaFittizio(true)
                  }}
                  className="btn btn-secondary mt-4 w-full"
                >
                  <UserPlus className="h-5 w-5" />
                  {q && persone.length === 0 ? `Crea «${cercaUtente.trim()}» come ente fittizio` : 'Crea ente o utente fittizio'}
                </button>
                <p className="mt-2 text-center text-xs text-gray-500">
                  Per chi non usa l'app: una parrocchia, un'associazione, un negozio.
                </p>
              </>
            ) : (
              <div className="space-y-3">
                <FormInput
                  label="Nome dell'ente"
                  id="nome_fittizio"
                  value={nomeFittizio}
                  onChange={(e) => setNomeFittizio(e.target.value)}
                  placeholder="Es. Parrocchia San Giovanni"
                />
                <p className="text-sm text-gray-500">
                  Nasce un account che non può entrare nell'app: serve solo a segnare chi porta cosa.
                  Il posto gli viene assegnato subito.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (!nomeFittizio.trim()) {
                      toast.error('Scrivi il nome dell\'ente')
                      return
                    }
                    creaFittizioMutation.mutate(nomeFittizio.trim())
                  }}
                  disabled={creaFittizioMutation.isPending}
                  className="btn btn-primary min-h-[52px] w-full text-base"
                >
                  {creaFittizioMutation.isPending ? 'Creo…' : 'Crea e assegna il posto'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMostraCreaFittizio(false)
                    setNomeFittizio('')
                  }}
                  className="btn btn-secondary w-full"
                >
                  Torna all'elenco
                </button>
              </div>
            )}
          </Modal>
        )
      })()}

      {/* Modal Associa Ricetta */}
      {slotPerRicetta && (() => {
        const chiudi = () => {
          setIsRicettaModalOpen(false)
          setSlotPerRicetta(null)
        }
        const adatte = (ricetteGlobali || []).filter(
          (r: any) => r.tipo_ricetta === slotPerRicetta.tipo_slot || !r.tipo_ricetta
        )
        const attuale = slotPerRicetta.ricetta_id || null
        const cambiata = ricettaScelta !== attuale
        return (
          <Modal
            isOpen={isRicettaModalOpen}
            onClose={chiudi}
            title={`Quale ricetta per ${cosaPorta(slotPerRicetta.tipo_slot)}?`}
            sottotitolo={[
              slotPerRicetta.numero_porzioni ? `${slotPerRicetta.numero_porzioni} porzioni` : null,
              slotPerRicetta.nome_ricetta ? `ora: ${slotPerRicetta.nome_ricetta}` : 'nessuna ricetta',
            ].filter(Boolean).join(' · ')}
            size="md"
            piede={
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleConfermaRicetta(ricettaScelta)}
                  disabled={!cambiata || !ricettaScelta || associaRicettaMutation.isPending}
                  className="btn btn-primary min-h-[52px] w-full text-base"
                >
                  {associaRicettaMutation.isPending ? 'Salvo…' : 'Usa questa ricetta'}
                </button>
                {attuale && (
                  <button
                    type="button"
                    onClick={() => handleConfermaRicetta(null)}
                    disabled={associaRicettaMutation.isPending}
                    className="btn w-full text-red-700 hover:bg-red-50"
                  >
                    Togli la ricetta
                  </button>
                )}
              </div>
            }
          >
            {adatte.length > 0 ? (
              <div role="radiogroup" aria-label="Ricette" className="flex flex-col gap-px overflow-hidden rounded-2xl border border-gray-200 bg-gray-200">
                {adatte.map((r: any) => {
                  const attiva = r.id === ricettaScelta
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="radio"
                      aria-checked={attiva}
                      onClick={() => setRicettaScelta(r.id)}
                      className={`flex min-h-[52px] items-center gap-3 px-4 py-2 text-left transition ${
                        attiva ? 'bg-primary-50' : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${
                          attiva ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {attiva ? <Check className="h-4 w-4" /> : <BookMarked className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-gray-900">{r.nome_ricetta}</span>
                        {r.porzioni && <span className="block text-xs text-gray-500">{r.porzioni} porzioni</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                Nel ricettario non c'è ancora nessuna ricetta di questo tipo.
              </p>
            )}
            <p className="mt-4 text-sm text-gray-500">
              Non la trovi?{' '}
              <a href="/ricettario" target="_blank" className="font-semibold text-primary-700 underline">
                Aggiungila al ricettario
              </a>
              , poi torna qui.
            </p>
          </Modal>
        )
      })()}
    </div>
  )
}

export default TurnoDetail

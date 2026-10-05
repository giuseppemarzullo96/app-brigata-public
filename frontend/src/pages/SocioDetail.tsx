import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/authService'
import { User, Mail, Phone, MapPin, Euro, History, Plus, Camera, CreditCard, Check, Pencil, KeyRound } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { useState } from 'react'
import Modal from '../components/Modal'
import { FormInput, FormTextarea, FormSelect } from '../components/FormInput'
import PayPalQuotaButton from '../components/PayPalQuotaButton'
import TesseraDigitale from '../components/TesseraDigitale'
import { esitoInvioCredenziali } from '../services/credenziali'

const SocioDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.ruolo === 'admin'
  const canEdit = isAdmin || user?.id === id
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false)
  const [selectedQuota, setSelectedQuota] = useState<any>(null)
  const [isUploadingFoto, setIsUploadingFoto] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isPayPalModalOpen, setIsPayPalModalOpen] = useState(false)
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false)
  const [emailForm, setEmailForm] = useState({ nuova_email: '', password: '' })
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', conferma: '' })
  const [editForm, setEditForm] = useState({
    nome: '', cognome: '', ragione_sociale: '', telefono: '', indirizzo: '', citta: '', cap: '', note: '',
    ruolo: '', categoria_socio: '',
  })
  const [paymentForm, setPaymentForm] = useState({
    metodo_pagamento: '',
    riferimento_pagamento: '',
  })
  const [validationForm, setValidationForm] = useState({
    validato: true,
    motivo_rifiuto: '',
  })
  const [quotaForm, setQuotaForm] = useState({
    anno: new Date().getFullYear().toString(),
    importo: '',
    data_pagamento: '',
    metodo_pagamento: '',
    riferimento_pagamento: '',
    note: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const response = await api.get(`/users/${id}`)
      return response.data
    },
  })

  const { data: quoteData } = useQuery({
    queryKey: ['user', id, 'quote'],
    queryFn: async () => {
      const response = await api.get(`/users/${id}/quote`)
      return response.data
    },
  })

  const { data: partecipazioniData } = useQuery({
    queryKey: ['user', id, 'partecipazioni'],
    queryFn: async () => {
      const response = await api.get(`/users/${id}/partecipazioni`)
      return response.data
    },
  })

  const updateSocioMutation = useMutation({
    mutationFn: async (data: any) => {
      await api.put(`/users/${id}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', id] })
      toast.success('Dati aggiornati con successo!')
      setIsEditModalOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'aggiornamento')
    },
  })

  const handleApriModificaEdit = () => {
    setEditForm({
      nome: socio.nome || '',
      cognome: socio.cognome || '',
      ragione_sociale: socio.ragione_sociale || '',
      telefono: socio.telefono || '',
      indirizzo: socio.indirizzo || '',
      citta: socio.citta || '',
      cap: socio.cap || '',
      note: socio.note || '',
      ruolo: socio.ruolo || '',
      categoria_socio: socio.categoria_socio || '',
    })
    setIsEditModalOpen(true)
  }

  // Una nuova password provvisoria, mandata al socio: la vecchia smette di valere.
  const rimandaCredenzialiMutation = useMutation({
    mutationFn: async () => (await api.post(`/users/${id}/rimanda-credenziali`)).data,
    onSuccess: (dati) => {
      const esito = esitoInvioCredenziali(dati?.credenziali)
      if (esito) (esito.ok ? toast.success : toast.error)(esito.testo, { duration: 6000 })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'invio dei dati di accesso')
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: async (dati: { currentPassword: string; newPassword: string }) => {
      const res = await api.post('/auth/change-password', dati)
      return res.data
    },
    onSuccess: () => {
      setIsPasswordModalOpen(false)
      setPasswordForm({ currentPassword: '', newPassword: '', conferma: '' })
      toast.success('Password cambiata. Usala dal prossimo accesso.')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante il cambio password')
    },
  })

  const changeEmailMutation = useMutation({
    mutationFn: async (dati: { nuova_email: string; password: string }) => {
      const res = await api.post('/auth/change-email', dati)
      return res.data
    },
    onSuccess: () => {
      setIsEmailModalOpen(false)
      setEmailForm({ nuova_email: '', password: '' })
      // Il socio entrera' con il nuovo indirizzo: va ricaricato anche il
      // profilo in sessione, altrimenti l'app continua a mostrare il vecchio.
      queryClient.invalidateQueries({ queryKey: ['socio', id] })
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      toast.success('Email aggiornata: da ora accedi con il nuovo indirizzo')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante il cambio email')
    },
  })

  const addQuotaMutation = useMutation({
    mutationFn: async (data: any) => {
      await api.post(`/users/${id}/quote`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', id, 'quote'] })
      queryClient.invalidateQueries({ queryKey: ['tessera'] })
      toast.success('Quota aggiunta con successo!')
      setIsQuotaModalOpen(false)
      setQuotaForm({
        anno: new Date().getFullYear().toString(),
        importo: '',
        data_pagamento: '',
        metodo_pagamento: '',
        riferimento_pagamento: '',
        note: '',
      })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'aggiunta della quota')
    },
  })

  const segnalaPagamentoMutation = useMutation({
    mutationFn: async ({ quotaId, data }: { quotaId: string; data: any }) => {
      await api.post(`/users/${id}/quote/${quotaId}/segnala-pagamento`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', id, 'quote'] })
      queryClient.invalidateQueries({ queryKey: ['tessera'] })
      toast.success('Pagamento segnalato! In attesa di validazione.')
      setIsPaymentModalOpen(false)
      setSelectedQuota(null)
      setPaymentForm({ metodo_pagamento: '', riferimento_pagamento: '' })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la segnalazione del pagamento')
    },
  })

  const validaPagamentoMutation = useMutation({
    mutationFn: async ({ quotaId, data }: { quotaId: string; data: any }) => {
      await api.post(`/users/${id}/quote/${quotaId}/valida-pagamento`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', id, 'quote'] })
      queryClient.invalidateQueries({ queryKey: ['tessera'] })
      toast.success('Pagamento aggiornato con successo!')
      setIsValidationModalOpen(false)
      setSelectedQuota(null)
      setValidationForm({ validato: true, motivo_rifiuto: '' })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la validazione del pagamento')
    },
  })

  

  const handleAddQuota = (e: React.FormEvent) => {
    e.preventDefault()
    addQuotaMutation.mutate(quotaForm)
  }

  const handleSegnalaPagamento = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedQuota) return
    segnalaPagamentoMutation.mutate({
      quotaId: selectedQuota.id,
      data: paymentForm,
    })
  }

  const handleValidaPagamento = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedQuota) return
    validaPagamentoMutation.mutate({
      quotaId: selectedQuota.id,
      data: validationForm,
    })
  }

  const openPaymentModal = (quota: any) => {
    setSelectedQuota(quota)
    setPaymentForm({ metodo_pagamento: '', riferimento_pagamento: '' })
    setIsPaymentModalOpen(true)
  }

  const openValidationModal = (quota: any) => {
    setSelectedQuota(quota)
    setValidationForm({ validato: true, motivo_rifiuto: '' })
    setIsValidationModalOpen(true)
  }

  const getStatoValidazioneLabel = (quota: any) => {
    if (quota.pagata) return { label: 'Pagata', className: 'bg-green-100 text-green-800' }
    if (quota.stato_validazione === 'in_attesa') return { label: 'In attesa validazione', className: 'bg-blue-100 text-blue-800' }
    if (quota.stato_validazione === 'rifiutato') return { label: 'Pagamento rifiutato', className: 'bg-red-100 text-red-800' }
    return { label: 'Da pagare', className: 'bg-yellow-100 text-yellow-800' }
  }

  

  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Verifica tipo file
    if (!file.type.startsWith('image/')) {
      toast.error('Il file deve essere un\'immagine')
      return
    }

    // Verifica dimensione (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File troppo grande. Dimensione massima: 5MB')
      return
    }

    setIsUploadingFoto(true)
    try {
      const formData = new FormData()
      formData.append('foto_profilo', file)

      await api.post(`/users/${id}/foto-profilo`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      toast.success('Foto profilo aggiornata con successo!')
      queryClient.invalidateQueries({ queryKey: ['user', id] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Errore durante il caricamento della foto')
    } finally {
      setIsUploadingFoto(false)
      // Reset input
      e.target.value = ''
    }
  }

  const getFileUrl = (path: string) => {
    if (!path) return ''
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path
    }
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'
    const backendUrl = apiUrl.replace('/api/v1', '')
    return `${backendUrl}${path}`
  }

  if (isLoading) {
    return <div>Caricamento...</div>
  }

  const socio = data?.user
  const quote = quoteData?.quote || []
  const partecipazioni = partecipazioniData?.partecipazioni || []

  if (!socio) {
    return <div>Socio non trovato</div>
  }

  

  return (
    <div>
      {(isAdmin || canEdit) && (
        <div className="flex items-center justify-between gap-4 mb-8">
          {isAdmin ? (
            <button
              onClick={() => navigate('/soci')}
              className="text-primary-600 hover:text-primary-700"
            >
              ← Torna ai soci
            </button>
          ) : (
            <span />
          )}
          {canEdit && (
            <button
              onClick={handleApriModificaEdit}
              className="btn btn-secondary flex items-center gap-2 text-sm"
            >
              <Pencil className="w-4 h-4" />
              Modifica
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Info Principali */}
        <div className="lg:col-span-2 space-y-4 lg:space-y-6">
          <div className="card">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
              <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                <div className="relative flex-shrink-0">
                  {socio.foto_profilo ? (
                    <img
                      src={getFileUrl(socio.foto_profilo)}
                      alt={socio.ragione_sociale || `${socio.nome} ${socio.cognome}`}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover"
                      onError={(e) => {
                        console.error('Errore caricamento foto profilo:', socio.foto_profilo, 'URL tentato:', e.currentTarget.src)
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-8 h-8 sm:w-10 sm:h-10 text-primary-600" />
                    </div>
                  )}
                  {canEdit && (
                    <label
                      htmlFor="foto-profilo-input"
                      className="absolute bottom-0 right-0 w-6 h-6 sm:w-7 sm:h-7 bg-primary-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-primary-700 transition-colors shadow-md"
                      title="Cambia foto profilo"
                    >
                      <Camera className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                      <input
                        id="foto-profilo-input"
                        type="file"
                        accept="image/*"
                        onChange={handleFotoChange}
                        className="hidden"
                        disabled={isUploadingFoto}
                      />
                    </label>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                    {socio.ragione_sociale || `${socio.nome} ${socio.cognome}`}
                  </h1>
                  <p className="text-sm sm:text-base text-gray-600 capitalize truncate">{socio.categoria_socio}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-gray-400" />
                <span className="flex-1">{socio.email}</span>
                {user?.id === id && (
                  <button
                    onClick={() => {
                      setEmailForm({ nuova_email: socio.email || '', password: '' })
                      setIsEmailModalOpen(true)
                    }}
                    className="text-sm text-primary-600 hover:text-primary-700"
                  >
                    Cambia
                  </button>
                )}
              </div>

              {user?.id === id && (
                <div className="flex items-center gap-3">
                  <KeyRound className="w-5 h-5 text-gray-400" />
                  <span className="flex-1 text-gray-500">Password</span>
                  <button
                    onClick={() => {
                      setPasswordForm({ currentPassword: '', newPassword: '', conferma: '' })
                      setIsPasswordModalOpen(true)
                    }}
                    className="text-sm text-primary-600 hover:text-primary-700"
                  >
                    Cambia
                  </button>
                </div>
              )}

              {isAdmin && user?.id !== id && !socio.fittizio && !socio.archiviato && (
                <div className="flex items-center gap-3">
                  <KeyRound className="w-5 h-5 text-gray-400" />
                  <span className="flex-1 text-gray-500">Accesso all'app</span>
                  <button
                    onClick={() => {
                      const canali = socio.telefono ? 'email e WhatsApp' : 'email'
                      if (confirm(`Mandare a ${socio.nome || socio.ragione_sociale} una nuova password provvisoria per ${canali}? Quella attuale smetterà di funzionare.`)) {
                        rimandaCredenzialiMutation.mutate()
                      }
                    }}
                    disabled={rimandaCredenzialiMutation.isPending}
                    className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50"
                  >
                    {rimandaCredenzialiMutation.isPending ? 'Invio…' : 'Rimanda i dati di accesso'}
                  </button>
                </div>
              )}

              {socio.telefono && (
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-gray-400" />
                  <span>{socio.telefono}</span>
                </div>
              )}

              {socio.indirizzo && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-gray-400" />
                  <span>
                    {socio.indirizzo}
                    {socio.citta && `, ${socio.citta}`}
                    {socio.cap && ` ${socio.cap}`}
                  </span>
                </div>
              )}

              <div className="pt-4 border-t">
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Ruolo:</strong> <span className="capitalize">{socio.ruolo?.replace('_', ' ')}</span>
                </p>
                <p className="text-sm text-gray-600 mb-2">
                  <strong>Tipo:</strong> {socio.tipo_persona === 'fisica' ? 'Persona Fisica' : 'Persona Giuridica'}
                </p>
                {socio.ragione_sociale && (
                  <p className="text-sm text-gray-600">
                    <strong>Ragione Sociale:</strong> {socio.ragione_sociale}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Quote Associative */}
          <div className="card">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
              <h2 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
                <Euro className="w-5 h-5 flex-shrink-0" />
                <span>Quote Associative</span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {isAdmin && (
                  <button 
                    onClick={() => setIsQuotaModalOpen(true)}
                    className="btn btn-primary text-xs sm:text-sm flex items-center whitespace-nowrap px-3 py-2"
                  >
                    <Plus className="w-4 h-4 mr-2 flex-shrink-0" />
                    <span className="hidden sm:inline">Aggiungi Quota</span>
                    <span className="sm:hidden">Aggiungi</span>
                  </button>
                )}
              </div>
            </div>

            {quote.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-500 text-sm mb-4">Nessuna quota registrata</p>
              </div>
            ) : (
              <div className="space-y-2">
                {quote.map((quota: any) => {
                  const statoInfo = getStatoValidazioneLabel(quota)
                  return (
                    <div key={quota.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-base sm:text-lg mb-1">Anno {quota.anno}</p>
                        <p className="text-sm text-gray-600 mb-1">
                          {parseFloat(quota.importo).toFixed(2)}€ - {quota.metodo_pagamento || 'Non specificato'}
                        </p>
                        {quota.data_pagamento && (
                          <p className="text-xs text-gray-500">
                            Pagata il: {format(new Date(quota.data_pagamento), 'd MMMM yyyy', { locale: it })}
                          </p>
                        )}
                        {quota.stato_validazione === 'in_attesa' && quota.data_segnalazione && (
                          <p className="text-xs text-blue-600">
                            Segnalato il: {format(new Date(quota.data_segnalazione), 'd MMMM yyyy', { locale: it })}
                          </p>
                        )}
                        {quota.stato_validazione === 'rifiutato' && quota.motivo_rifiuto && (
                          <p className="text-xs text-red-600">
                            Motivo rifiuto: {quota.motivo_rifiuto}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                        <span className={`px-2 py-1 rounded text-xs whitespace-nowrap flex-shrink-0 ${statoInfo.className}`}>
                          {statoInfo.label}
                        </span>
                        
                        {/* Pagamento online con PayPal, solo sul proprio profilo */}
                        {canEdit && !quota.pagata && quota.stato_validazione !== 'in_attesa' && (
                          <button
                            onClick={() => {
                              setSelectedQuota(quota)
                              setIsPayPalModalOpen(true)
                            }}
                            className="btn btn-primary text-xs flex items-center gap-1 px-2 py-1"
                            title="Paga con PayPal"
                          >
                            <CreditCard className="w-3 h-3" />
                            <span className="hidden sm:inline">Paga con PayPal</span>
                          </button>
                        )}

                        {/* User può segnalare pagamento se quota non pagata e non in attesa */}
                        {canEdit && !quota.pagata && quota.stato_validazione !== 'in_attesa' && (
                          <button
                            onClick={() => openPaymentModal(quota)}
                            className="btn btn-secondary text-xs flex items-center gap-1 px-2 py-1"
                            title="Segnala un pagamento fatto in altro modo"
                          >
                            <span className="hidden sm:inline">Segnala pagamento</span>
                            <span className="sm:hidden">Segnala</span>
                          </button>
                        )}
                        
                        {/* Admin può validare se in attesa */}
                        {isAdmin && quota.stato_validazione === 'in_attesa' && (
                          <button
                            onClick={() => openValidationModal(quota)}
                            className="btn btn-secondary text-xs flex items-center gap-1 px-2 py-1"
                            title="Valida pagamento"
                          >
                            <Check className="w-3 h-3" />
                            <span className="hidden sm:inline">Valida</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Partecipazioni */}
          <div className="card">
            <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
              <History className="w-5 h-5" />
              Partecipazioni Attività
            </h2>

            {partecipazioni.length === 0 ? (
              <p className="text-gray-500 text-sm">Nessuna partecipazione registrata</p>
            ) : (
              <div className="space-y-2">
                {partecipazioni.slice(0, 10).map((part: any) => (
                  <div key={part.id} className="p-3 bg-gray-50 rounded text-sm">
                    <p className="font-medium capitalize">{part.tipo_attivita}</p>
                    <p className="text-gray-600">
                      {format(new Date(part.data_attivita), 'd MMMM yyyy', { locale: it })}
                      {part.tipo_turno && ` - ${part.tipo_turno}`}
                      {part.tipo_slot && ` (${part.tipo_slot})`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4 lg:space-y-6">
          {/* La tessera va nel wallet di chi la chiede: solo sul proprio profilo. */}
          {user?.id === id && <TesseraDigitale />}

          <div className="card">
            <h3 className="font-semibold mb-4">Stato</h3>
            <div className="space-y-2">
              {socio.numero_tessera && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Tessera n.</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {String(socio.numero_tessera).padStart(4, '0')}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Attivo</span>
                <span
                  className={`px-2 py-1 rounded text-xs ${
                    socio.attivo
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {socio.attivo ? 'Sì' : 'No'}
                </span>
              </div>
              {socio.sospeso && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Sospeso</span>
                  <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800">
                    Sì
                  </span>
                </div>
              )}
              {socio.archiviato && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Archiviato</span>
                  <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-800">
                    Sì
                  </span>
                </div>
              )}
            </div>
          </div>

          {isAdmin && socio.note && (
            <div className="card">
              <h3 className="font-semibold mb-2">Note</h3>
              <p className="text-sm text-gray-700 whitespace-pre-line">{socio.note}</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal Aggiungi Quota */}
      <Modal
        isOpen={isQuotaModalOpen}
        onClose={() => setIsQuotaModalOpen(false)}
        title="Aggiungi Quota Associativa"
        size="md"
      >
        <form onSubmit={handleAddQuota}>
          <FormInput
            label="Anno"
            id="anno"
            type="number"
            value={quotaForm.anno}
            onChange={(e) => setQuotaForm({ ...quotaForm, anno: e.target.value })}
            required
            min="2020"
            max={new Date().getFullYear() + 1}
          />

          <FormInput
            label="Importo (€)"
            id="importo"
            type="number"
            step="0.01"
            value={quotaForm.importo}
            onChange={(e) => setQuotaForm({ ...quotaForm, importo: e.target.value })}
            required
            min="0"
          />

          <FormInput
            label="Data Pagamento (opzionale)"
            id="data_pagamento"
            type="date"
            value={quotaForm.data_pagamento}
            onChange={(e) => setQuotaForm({ ...quotaForm, data_pagamento: e.target.value })}
          />

          <FormSelect
            label="Metodo di Pagamento"
            id="metodo_pagamento"
            value={quotaForm.metodo_pagamento}
            onChange={(e) => setQuotaForm({ ...quotaForm, metodo_pagamento: e.target.value })}
            options={[
              { value: '', label: 'Seleziona metodo' },
              { value: 'contanti', label: 'Contanti' },
              { value: 'bonifico', label: 'Bonifico' },
              { value: 'paypal', label: 'PayPal' },
              { value: 'altro', label: 'Altro' },
            ]}
          />

          <FormInput
            label="Riferimento Pagamento (opzionale)"
            id="riferimento_pagamento"
            value={quotaForm.riferimento_pagamento}
            onChange={(e) => setQuotaForm({ ...quotaForm, riferimento_pagamento: e.target.value })}
            placeholder="Es: numero bonifico, transazione PayPal, etc."
          />

          <FormTextarea
            label="Note (opzionale)"
            id="note"
            value={quotaForm.note}
            onChange={(e) => setQuotaForm({ ...quotaForm, note: e.target.value })}
            rows={3}
          />

          <div className="flex justify-end gap-4 mt-6">
            <button
              type="button"
              onClick={() => setIsQuotaModalOpen(false)}
              className="btn btn-secondary"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={addQuotaMutation.isPending}
            >
              {addQuotaMutation.isPending ? 'Aggiunta...' : 'Aggiungi Quota'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Segnala Pagamento */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false)
          setSelectedQuota(null)
        }}
        title={`Segnala Pagamento - Anno ${selectedQuota?.anno}`}
        size="md"
      >
        <form onSubmit={handleSegnalaPagamento}>
          <p className="text-sm text-gray-600 mb-4">
            Importo da pagare: <strong>{selectedQuota ? parseFloat(selectedQuota.importo).toFixed(2) : '0.00'}€</strong>
          </p>

          <FormSelect
            label="Metodo di Pagamento"
            id="payment_metodo"
            value={paymentForm.metodo_pagamento}
            onChange={(e) => setPaymentForm({ ...paymentForm, metodo_pagamento: e.target.value })}
            options={[
              { value: '', label: 'Seleziona metodo' },
              { value: 'contanti', label: 'Contanti' },
              { value: 'bonifico', label: 'Bonifico' },
              { value: 'paypal', label: 'PayPal' },
            ]}
            required
          />

          <FormInput
            label="Riferimento Pagamento (opzionale)"
            id="payment_riferimento"
            value={paymentForm.riferimento_pagamento}
            onChange={(e) => setPaymentForm({ ...paymentForm, riferimento_pagamento: e.target.value })}
            placeholder="Es: numero bonifico, transazione PayPal, etc."
          />

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
            <p className="text-sm text-blue-800">
              Dopo aver segnalato il pagamento, un amministratore dovrà validarlo per confermare la quota come pagata.
            </p>
          </div>

          <div className="flex justify-end gap-4 mt-6">
            <button
              type="button"
              onClick={() => {
                setIsPaymentModalOpen(false)
                setSelectedQuota(null)
              }}
              className="btn btn-secondary"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={segnalaPagamentoMutation.isPending || !paymentForm.metodo_pagamento}
            >
              {segnalaPagamentoMutation.isPending ? 'Invio...' : 'Segnala Pagamento'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Valida Pagamento (solo Admin) */}
      <Modal
        isOpen={isValidationModalOpen}
        onClose={() => {
          setIsValidationModalOpen(false)
          setSelectedQuota(null)
        }}
        title={`Valida Pagamento - Anno ${selectedQuota?.anno}`}
        size="md"
      >
        <form onSubmit={handleValidaPagamento}>
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-600 mb-2">
              <strong>Importo:</strong> {selectedQuota ? parseFloat(selectedQuota.importo).toFixed(2) : '0.00'}€
            </p>
            <p className="text-sm text-gray-600 mb-2">
              <strong>Metodo:</strong> {selectedQuota?.metodo_pagamento || 'Non specificato'}
            </p>
            {selectedQuota?.riferimento_pagamento && (
              <p className="text-sm text-gray-600 mb-2">
                <strong>Riferimento:</strong> {selectedQuota.riferimento_pagamento}
              </p>
            )}
            {selectedQuota?.data_segnalazione && (
              <p className="text-sm text-gray-600">
                <strong>Data segnalazione:</strong> {format(new Date(selectedQuota.data_segnalazione), 'd MMMM yyyy', { locale: it })}
              </p>
            )}
          </div>

          <FormSelect
            label="Decisione"
            id="validation_decision"
            value={validationForm.validato ? 'true' : 'false'}
            onChange={(e) => setValidationForm({ ...validationForm, validato: e.target.value === 'true' })}
            options={[
              { value: 'true', label: '✓ Valida pagamento' },
              { value: 'false', label: '✗ Rifiuta pagamento' },
            ]}
          />

          {!validationForm.validato && (
            <FormTextarea
              label="Motivo del rifiuto"
              id="validation_motivo"
              value={validationForm.motivo_rifiuto}
              onChange={(e) => setValidationForm({ ...validationForm, motivo_rifiuto: e.target.value })}
              placeholder="Inserisci il motivo del rifiuto..."
              rows={3}
            />
          )}

          <div className="flex justify-end gap-4 mt-6">
            <button
              type="button"
              onClick={() => {
                setIsValidationModalOpen(false)
                setSelectedQuota(null)
              }}
              className="btn btn-secondary"
            >
              Annulla
            </button>
            <button
              type="submit"
              className={`btn ${validationForm.validato ? 'btn-primary' : 'bg-red-600 hover:bg-red-700 text-white'}`}
              disabled={validaPagamentoMutation.isPending}
            >
              {validaPagamentoMutation.isPending 
                ? 'Elaborazione...' 
                : validationForm.validato 
                  ? 'Conferma Validazione' 
                  : 'Conferma Rifiuto'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Pagamento PayPal */}
      <Modal
        isOpen={isPayPalModalOpen}
        onClose={() => {
          setIsPayPalModalOpen(false)
          setSelectedQuota(null)
        }}
        title={`Paga quota ${selectedQuota?.anno || ''}`}
        size="sm"
      >
        {selectedQuota && (
          <div>
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <p className="text-sm text-gray-600">Importo da pagare</p>
              <p className="text-2xl font-bold text-gray-900">
                {parseFloat(selectedQuota.importo).toFixed(2)}€
              </p>
            </div>
            <PayPalQuotaButton
              userId={id as string}
              quotaId={selectedQuota.id}
              onPagamentoCompletato={() => {
                queryClient.invalidateQueries({ queryKey: ['user', id, 'quote'] })
                queryClient.invalidateQueries({ queryKey: ['tessera'] })
                setIsPayPalModalOpen(false)
                setSelectedQuota(null)
              }}
            />
          </div>
        )}
      </Modal>

      {/* Modal Modifica Dati */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Modifica dati"
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const { ruolo, categoria_socio, note, ...resto } = editForm
            updateSocioMutation.mutate(isAdmin ? editForm : resto)
          }}
        >
          {socio.tipo_persona === 'giuridica' ? (
            <FormInput
              label="Ragione sociale"
              id="ragione_sociale"
              value={editForm.ragione_sociale}
              onChange={(e) => setEditForm({ ...editForm, ragione_sociale: e.target.value })}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <FormInput
                label="Nome"
                id="nome"
                value={editForm.nome}
                onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
              />
              <FormInput
                label="Cognome"
                id="cognome"
                value={editForm.cognome}
                onChange={(e) => setEditForm({ ...editForm, cognome: e.target.value })}
              />
            </div>
          )}

          <FormInput
            label="Telefono"
            id="telefono"
            value={editForm.telefono}
            onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })}
            placeholder="333 1234567"
          />

          <FormInput
            label="Indirizzo"
            id="indirizzo"
            value={editForm.indirizzo}
            onChange={(e) => setEditForm({ ...editForm, indirizzo: e.target.value })}
            placeholder="Via Roma 1"
          />

          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label="Città"
              id="citta"
              value={editForm.citta}
              onChange={(e) => setEditForm({ ...editForm, citta: e.target.value })}
            />
            <FormInput
              label="CAP"
              id="cap"
              value={editForm.cap}
              onChange={(e) => setEditForm({ ...editForm, cap: e.target.value })}
            />
          </div>

          {/* Le note sono annotazioni dell'amministratore sul socio: il socio
              non deve poterle leggere dal form ne' sovrascriverle. */}
          {isAdmin && (
            <FormTextarea
              label="Note"
              id="note"
              value={editForm.note}
              onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
              rows={4}
            />
          )}

          {isAdmin && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">
                Ruolo e categoria
                <span className="block text-xs font-normal text-gray-500">
                  Determinano cosa questa persona può fare nell'app.
                </span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormSelect
                  label="Ruolo"
                  id="ruolo"
                  value={editForm.ruolo}
                  onChange={(e) => setEditForm({ ...editForm, ruolo: e.target.value })}
                  options={[
                    { value: 'admin', label: 'Admin' },
                    { value: 'gestore_cucine', label: 'Gestore Cucine' },
                    { value: 'socio_volontario', label: 'Socio Volontario' },
                    { value: 'socio_ordinario', label: 'Socio Ordinario' },
                    { value: 'simpatizzante', label: 'Simpatizzante' },
                    { value: 'esterno', label: 'Esterno' },
                  ]}
                />
                <FormSelect
                  label="Categoria socio"
                  id="categoria_socio"
                  value={editForm.categoria_socio}
                  onChange={(e) => setEditForm({ ...editForm, categoria_socio: e.target.value })}
                  options={[
                    { value: 'volontario', label: 'Volontario' },
                    { value: 'ordinario', label: 'Ordinario' },
                    { value: 'simpatizzante', label: 'Simpatizzante' },
                    { value: 'esterno', label: 'Esterno' },
                  ]}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Il <strong>Gestore Cucine</strong> crea e modifica turni, slot e ricette come un
                admin, ma non vede libro soci, quote e impostazioni.
              </p>
            </div>
          )}

          <div className="flex gap-4 mt-6">
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={updateSocioMutation.isPending}
            >
              {updateSocioMutation.isPending ? 'Salvataggio...' : 'Salva'}
            </button>
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="btn btn-secondary flex-1"
            >
              Annulla
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Cambio Password */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="Cambia password"
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            changePasswordMutation.mutate({
              currentPassword: passwordForm.currentPassword,
              newPassword: passwordForm.newPassword,
            })
          }}
        >
          <p className="text-sm text-gray-600 mb-4">
            Se sei entrato con la password provvisoria ricevuta su WhatsApp, cambiala con una
            tua: quella resta scritta nella chat.
          </p>

          <FormInput
            label="Password attuale"
            id="password_attuale"
            type="password"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
            placeholder="••••••••"
            required
          />

          <FormInput
            label="Nuova password"
            id="password_nuova"
            type="password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            placeholder="almeno 8 caratteri"
            required
          />

          <FormInput
            label="Ripeti la nuova password"
            id="password_conferma_nuova"
            type="password"
            value={passwordForm.conferma}
            onChange={(e) => setPasswordForm({ ...passwordForm, conferma: e.target.value })}
            placeholder="••••••••"
            required
          />

          {passwordForm.newPassword.length > 0 && passwordForm.newPassword.length < 8 && (
            <p className="text-sm text-amber-600">La password deve essere di almeno 8 caratteri.</p>
          )}
          {passwordForm.conferma.length > 0 && passwordForm.newPassword !== passwordForm.conferma && (
            <p className="text-sm text-red-600">Le due password non coincidono.</p>
          )}

          <div className="flex gap-4 mt-6">
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={
                changePasswordMutation.isPending ||
                !passwordForm.currentPassword ||
                passwordForm.newPassword.length < 8 ||
                passwordForm.newPassword !== passwordForm.conferma
              }
            >
              {changePasswordMutation.isPending ? 'Salvataggio...' : 'Cambia password'}
            </button>
            <button
              type="button"
              onClick={() => setIsPasswordModalOpen(false)}
              className="btn btn-secondary flex-1"
            >
              Annulla
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Cambio Email */}
      <Modal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        title="Cambia email"
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            changeEmailMutation.mutate(emailForm)
          }}
        >
          <p className="text-sm text-gray-600 mb-4">
            L'email è anche il tuo nome utente: dopo il cambio dovrai accedere con il nuovo
            indirizzo. Per sicurezza conferma la password che usi ora.
          </p>

          <FormInput
            label="Nuova email"
            id="nuova_email"
            type="email"
            value={emailForm.nuova_email}
            onChange={(e) => setEmailForm({ ...emailForm, nuova_email: e.target.value })}
            placeholder="nome@esempio.it"
            required
          />

          <FormInput
            label="La tua password attuale"
            id="password_conferma"
            type="password"
            value={emailForm.password}
            onChange={(e) => setEmailForm({ ...emailForm, password: e.target.value })}
            placeholder="••••••••"
            required
          />

          <div className="flex gap-4 mt-6">
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={
                changeEmailMutation.isPending ||
                !emailForm.nuova_email.trim() ||
                !emailForm.password ||
                emailForm.nuova_email.trim().toLowerCase() === (socio.email || '').toLowerCase()
              }
            >
              {changeEmailMutation.isPending ? 'Salvataggio...' : 'Cambia email'}
            </button>
            <button
              type="button"
              onClick={() => setIsEmailModalOpen(false)}
              className="btn btn-secondary flex-1"
            >
              Annulla
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

export default SocioDetail


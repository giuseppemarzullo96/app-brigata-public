import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/authService'
import { MessageSquare, Send, User, Search, X, Users, Plus, Trash2, Settings, Image, Mic, Video, File, Paperclip, Play, Pause, ArrowLeft, Edit, RotateCcw, MoreHorizontal } from 'lucide-react'
import Modal from '../components/Modal'
import { FormInput, FormTextarea, FormSelect } from '../components/FormInput'
import { useAuth } from '../contexts/AuthContext'
import { useE2EEncryption } from '../hooks/useE2EEncryption'
import { useAreaVisibile, useBloccaScorrimento } from '../hooks/useAreaVisibile'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

// Helper per costruire URL completo per file uploadati
const getFileUrl = (path: string) => {
  if (!path) return ''
  // Se il percorso inizia già con http, restituiscilo così com'è
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  // Altrimenti costruisci l'URL completo usando l'URL del backend
  // Rimuovi /api/v1 se presente perché i file statici sono serviti direttamente da /uploads
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'
  const backendUrl = apiUrl.replace('/api/v1', '')
  return `${backendUrl}${path}`
}

/**
 * Identificativo della conversazione che esiste solo sullo schermo, aperta con
 * qualcuno ma senza ancora un messaggio. Non arriva mai al server.
 */
const BOZZA = 'bozza'

/** I messaggi della vecchia chat cifrata che su questo dispositivo non si possono piu' leggere. */
const VECCHIO_ILLEGGIBILE = '[Messaggio della vecchia chat cifrata: su questo dispositivo non si può più leggere]'
const ANTEPRIMA_ILLEGGIBILE = 'Messaggio della vecchia chat cifrata'

const Messaggi = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.ruolo === 'admin'
  const userCategoria = user?.categoria_socio || user?.ruolo
  const categoriePermesse = ['admin', 'volontario', 'ordinario']
  const canUseChat = categoriePermesse.includes(userCategoria) || isAdmin

  // La chat non cifra piu' i messaggi nuovi. Resta la lettura di quelli
  // vecchi, se questo dispositivo ha ancora la chiave di allora.
  const { isInitialized, initializeKeys, decryptMessage } = useE2EEncryption()
  useEffect(() => {
    if (canUseChat && !isInitialized) initializeKeys()
  }, [canUseChat, isInitialized, initializeKeys])

  const [conversazioneSelezionata, setConversazioneSelezionata] = useState<string | null>(null)
  /**
   * Conversazione appena aperta con qualcuno, prima che esista davvero.
   *
   * Una conversazione nasce solo quando c'e' un messaggio: finora l'app ne
   * inviava uno finto, "Conversazione iniziata", che restava li' in cima a
   * ogni chat. Ora la conversazione vive nello schermo finche' non si scrive
   * qualcosa, e nasce con il primo messaggio vero.
   */
  const [conversazioneBozza, setConversazioneBozza] = useState<any | null>(null)
  const [nuovoMessaggio, setNuovoMessaggio] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false)
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [messaggioDaModificare, setMessaggioDaModificare] = useState<any>(null)
  const [contenutoModificato, setContenutoModificato] = useState('')
  const [messaggioHovered, setMessaggioHovered] = useState<string | null>(null)
  const [newChatRecipient, setNewChatRecipient] = useState('')
  const [allegatoFile, setAllegatoFile] = useState<File | null>(null)
  const [allegatoPreview, setAllegatoPreview] = useState<string | null>(null)
  const [isPlayingAudio, setIsPlayingAudio] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [notificheAudio, setNotificheAudio] = useState(true)
  const lastMessageIdRef = useRef<string | null>(null)
  // Cache per contenuti originali dei messaggi inviati (per mostrare il testo in chiaro invece di quello crittografato)
  const messaggiInviatiCache = useRef<Map<string, string>>(new Map())
  const [newGroupForm, setNewGroupForm] = useState({
    nome: '',
    descrizione: '',
    partecipanti: [] as string[],
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Verifica permessi
  if (!canUseChat) {
    return (
      <div className="card text-center py-12">
        <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">Solo admin e soci possono utilizzare la chat</p>
      </div>
    )
  }

  // Carica lista utenti per iniziare nuove conversazioni
  const { data: usersData } = useQuery({
    queryKey: ['users', 'chat'],
    queryFn: async () => {
      const response = await api.get('/users', { params: { fittizio: 'false' } })
      return response.data
    },
    enabled: canUseChat,
  })

  // Carica conversazioni
  const { data: conversazioniData, isLoading: isLoadingConversazioni } = useQuery({
    // Con la chiave pronta si decifra di nuovo: prima il risultato fallito restava.
    queryKey: ['messaggi', 'conversazioni', isInitialized],
    queryFn: async () => {
      const response = await api.get('/messaggi/conversazioni')
      const data = response.data
      
      // Decrittografa l'ultimo messaggio nell'anteprima se necessario
      if (data.conversazioni && data.conversazioni.length > 0 && decryptMessage) {
        const conversazioniProcessate = await Promise.all(
          data.conversazioni.map(async (conv: any) => {
            // Se l'ultimo messaggio è crittografato, decrittografalo o usa la cache
            if (conv.ultimo_messaggio_crittografato && conv.ultimo_messaggio) {
              // Se l'ultimo messaggio l'abbiamo scritto noi: prima la cache,
              // poi la copia cifrata apposta per il mittente.
              if (conv.ultimo_messaggio_mittente_id === user?.id) {
                const contenutoOriginale = messaggiInviatiCache.current.get(conv.ultimo_messaggio_id)
                if (contenutoOriginale) {
                  return { ...conv, ultimo_messaggio: contenutoOriginale }
                }

                if (conv.ultimo_messaggio_contenuto_mittente && conv.ultimo_messaggio_iv_mittente
                    && conv.ultimo_messaggio_chiave_ephemeral_mittente) {
                  try {
                    const mio = await decryptMessage(
                      {
                        encryptedContent: conv.ultimo_messaggio_contenuto_mittente,
                        iv: conv.ultimo_messaggio_iv_mittente,
                        ephemeralPublicKey: conv.ultimo_messaggio_chiave_ephemeral_mittente
                      },
                      conv.ultimo_messaggio_mittente_id
                    )
                    if (mio) {
                      messaggiInviatiCache.current.set(conv.ultimo_messaggio_id, mio)
                      return { ...conv, ultimo_messaggio: mio }
                    }
                  } catch (error) {
                    console.error('Errore decrittografia anteprima:', error)
                  }
                }
                return { ...conv, ultimo_messaggio: ANTEPRIMA_ILLEGGIBILE }
              }
              
              // Se è un messaggio ricevuto, decrittografalo
              if (conv.ultimo_messaggio_iv && conv.ultimo_messaggio_chiave_ephemeral) {
                try {
                  const decrypted = await decryptMessage(
                    {
                      encryptedContent: conv.ultimo_messaggio,
                      iv: conv.ultimo_messaggio_iv,
                      ephemeralPublicKey: conv.ultimo_messaggio_chiave_ephemeral
                    },
                    conv.ultimo_messaggio_mittente_id
                  )
                  if (decrypted) {
                    return { ...conv, ultimo_messaggio: decrypted }
                  }
                } catch (error) {
                  console.error('Errore decrittografia ultimo messaggio:', error)
                }
              }
              return { ...conv, ultimo_messaggio: ANTEPRIMA_ILLEGGIBILE }
            }
            return conv
          })
        )
        return { ...data, conversazioni: conversazioniProcessate }
      }
      
      return data
    },
    enabled: canUseChat,
    refetchInterval: 10000, // Aggiorna ogni 10 secondi (ridotto per ridurre richieste)
    refetchOnWindowFocus: true, // Aggiorna quando si torna alla finestra
  })

  // Carica messaggi della conversazione selezionata
  const { data: messaggiData, isLoading: isLoadingMessaggi } = useQuery({
    queryKey: ['messaggi', 'conversazione', conversazioneSelezionata, isInitialized],
    queryFn: async () => {
      if (!conversazioneSelezionata || conversazioneSelezionata === BOZZA) return { messaggi: [] }
      const response = await api.get(`/messaggi/conversazione/${conversazioneSelezionata}`)
      const data = response.data
      
      // Decrittografa i messaggi se necessario (solo per messaggi ricevuti, non per quelli inviati)
      if (data.messaggi && data.messaggi.length > 0 && decryptMessage) {
        const messaggiDecrittati = await Promise.all(
          data.messaggi.map(async (msg: any) => {
            // I messaggi che abbiamo scritto noi: c'e' una copia cifrata
            // apposta per il mittente. La cache in memoria resta come
            // scorciatoia, ma non e' piu' l'unica speranza: prima, ricaricando
            // la pagina, il proprio testo spariva per sempre.
            if (msg.mittente_id === user?.id && msg.crittografato) {
              const contenutoOriginale = messaggiInviatiCache.current.get(msg.id)
              if (contenutoOriginale) {
                return { ...msg, contenuto: contenutoOriginale }
              }

              if (msg.contenuto_mittente && msg.iv_mittente && msg.chiave_ephemeral_mittente) {
                try {
                  const mio = await decryptMessage(
                    {
                      encryptedContent: msg.contenuto_mittente,
                      iv: msg.iv_mittente,
                      ephemeralPublicKey: msg.chiave_ephemeral_mittente
                    },
                    msg.mittente_id
                  )
                  if (mio) {
                    messaggiInviatiCache.current.set(msg.id, mio)
                    return { ...msg, contenuto: mio }
                  }
                } catch (error) {
                  console.error('Errore decrittografia della propria copia:', error)
                }
              }

              // Senza copia per il mittente (messaggi vecchi), o cifrata con
              // una chiave che su questo dispositivo non c'e'.
              return { ...msg, contenuto: VECCHIO_ILLEGGIBILE }
            }
            
            // Decrittografa solo i messaggi ricevuti (non inviati da noi)
            // Ricevuto dalla vecchia chat cifrata: si legge solo se qui c'e' ancora la chiave.
            if (msg.crittografato) {
              try {
                const decrypted = await decryptMessage(
                  {
                    encryptedContent: msg.contenuto,
                    iv: msg.iv,
                    ephemeralPublicKey: msg.chiave_ephemeral
                  },
                  msg.mittente_id
                )
                if (decrypted) {
                  return { ...msg, contenuto: decrypted }
                }
              } catch (error) {
                console.error('Errore decrittografia messaggio:', error)
              }
              // Mai mostrare il testo cifrato: e' una fila di caratteri senza senso.
              return { ...msg, contenuto: VECCHIO_ILLEGGIBILE }
            }
            return msg
          })
        )
        return { ...data, messaggi: messaggiDecrittati }
      }
      
      return data
    },
    enabled: !!conversazioneSelezionata && conversazioneSelezionata !== BOZZA && canUseChat,
    refetchInterval: 10000, // Aggiorna ogni 10 secondi quando una conversazione è aperta (ridotto per ridurre richieste)
    refetchOnWindowFocus: true, // Aggiorna quando si torna alla finestra
  })

  // Invalida il conteggio dei messaggi non letti quando vengono caricati i messaggi
  useEffect(() => {
    if (messaggiData?.messaggi) {
      // Il backend segna automaticamente i messaggi come letti quando vengono recuperati
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['messaggi', 'non-letti-count'] })
        queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazioni'] })
      }, 300)
    }
  }, [messaggiData?.messaggi, queryClient])

  // Invalida il conteggio dei messaggi non letti quando si apre una conversazione
  useEffect(() => {
    if (conversazioneSelezionata) {
      // Aspetta un po' per permettere al backend di segnare i messaggi come letti
      const timer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['messaggi', 'non-letti-count'] })
        queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazioni'] })
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [conversazioneSelezionata, queryClient])

  const inviaMessaggioMutation = useMutation({
    mutationFn: async (data: { conversazione_id?: string; contenuto: string; destinatario_id?: string; gruppo_id?: string; file?: File; crittografato?: boolean; iv?: string | null; chiave_ephemeral?: string | null; contenuto_mittente?: string | null; iv_mittente?: string | null; chiave_ephemeral_mittente?: string | null; contenutoOriginale?: string }) => {
      const formData = new FormData()
      formData.append('contenuto', data.contenuto || '')
      if (data.conversazione_id) formData.append('conversazione_id', data.conversazione_id)
      if (data.destinatario_id) formData.append('destinatario_id', data.destinatario_id)
      if (data.gruppo_id) formData.append('gruppo_id', data.gruppo_id)
      if (data.file) formData.append('allegato_messaggio', data.file)
      if (data.crittografato !== undefined) formData.append('crittografato', data.crittografato ? 'true' : 'false')
      if (data.contenuto_mittente) formData.append('contenuto_mittente', data.contenuto_mittente)
      if (data.iv_mittente) formData.append('iv_mittente', data.iv_mittente)
      if (data.chiave_ephemeral_mittente) formData.append('chiave_ephemeral_mittente', data.chiave_ephemeral_mittente)
      if (data.iv) formData.append('iv', data.iv)
      if (data.chiave_ephemeral) formData.append('chiave_ephemeral', data.chiave_ephemeral)
      
      const response = await api.post('/messaggi', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response
    },
    onSuccess: async (response: any, variables: any) => {
      // Salva il contenuto originale del messaggio inviato nella cache
      // (solo se è crittografato, così possiamo mostrarlo invece del contenuto crittografato)
      if (response?.data?.messaggio) {
        const messaggioInviato = response.data.messaggio
        const contenutoOriginale = variables.contenutoOriginale || nuovoMessaggio.trim()
        if (messaggioInviato.crittografato && contenutoOriginale) {
          messaggiInviatiCache.current.set(messaggioInviato.id, contenutoOriginale)
        }
      }
      
      // Era una bozza: ora la conversazione esiste davvero, si passa a quella.
      const nato = response?.data?.messaggio
      if (conversazioneSelezionata === BOZZA && nato?.conversazione_id) {
        setConversazioneBozza(null)
        setConversazioneSelezionata(nato.conversazione_id)
      }

      // Invalida immediatamente tutte le query relative ai messaggi
      queryClient.invalidateQueries({ queryKey: ['messaggi'] })
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazioni'] })
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'non-letti-count'] })
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazione', conversazioneSelezionata] })
      
      setNuovoMessaggio('')
      setAllegatoFile(null)
      setAllegatoPreview(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      // Scrolla in basso dopo l'invio
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'invio')
    },
  })

  const creaGruppoMutation = useMutation({
    mutationFn: async (data: { nome: string; descrizione?: string; partecipanti?: string[] }) => {
      const response = await api.post('/messaggi/gruppi', data)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazioni'] })
      toast.success('Gruppo creato con successo!')
      setIsNewGroupModalOpen(false)
      setNewGroupForm({ nome: '', descrizione: '', partecipanti: [] })
      if (data.gruppo?.id) {
        setConversazioneSelezionata(data.gruppo.id)
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la creazione del gruppo')
    },
  })

  const eliminaGruppoMutation = useMutation({
    mutationFn: async (gruppoId: string) => {
      await api.delete(`/messaggi/gruppi/${gruppoId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazioni'] })
      toast.success('Gruppo eliminato con successo!')
      setConversazioneSelezionata(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'eliminazione del gruppo')
    },
  })

  const cambiaFotoGruppoMutation = useMutation({
    mutationFn: async ({ gruppoId, file }: { gruppoId: string; file: File }) => {
      const formData = new FormData()
      formData.append('foto_gruppo', file)
      const response = await api.post(`/messaggi/gruppi/${gruppoId}/foto`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazioni'] })
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazione', conversazioneSelezionata] })
      toast.success('Foto profilo aggiornata!')
      setIsSettingsModalOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante il cambio della foto')
    },
  })

  const rimuoviPartecipanteMutation = useMutation({
    mutationFn: async ({ gruppoId, userId }: { gruppoId: string; userId: string }) => {
      await api.delete(`/messaggi/gruppi/${gruppoId}/partecipanti/${userId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'gruppi', conversazioneSelezionata, 'partecipanti'] })
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazioni'] })
      toast.success('Partecipante rimosso con successo!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la rimozione del partecipante')
    },
  })

  const eliminaMessaggioMutation = useMutation({
    mutationFn: async (messaggioId: string) => {
      await api.delete(`/messaggi/${messaggioId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaggi'] })
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazioni'] })
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazione', conversazioneSelezionata] })
      toast.success('Messaggio eliminato')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'eliminazione del messaggio')
    },
  })

  const modificaMessaggioMutation = useMutation({
    mutationFn: async ({ messaggioId, contenuto }: { messaggioId: string; contenuto: string }) => {
      const response = await api.put(`/messaggi/${messaggioId}`, { contenuto })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaggi'] })
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazioni'] })
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazione', conversazioneSelezionata] })
      toast.success('Messaggio modificato')
      setIsEditModalOpen(false)
      setMessaggioDaModificare(null)
      setContenutoModificato('')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la modifica del messaggio')
    },
  })

  const resettaChatMutation = useMutation({
    mutationFn: async (conversazioneId: string) => {
      await api.delete(`/messaggi/conversazione/${conversazioneId}/reset`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messaggi'] })
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazioni'] })
      queryClient.invalidateQueries({ queryKey: ['messaggi', 'conversazione', conversazioneSelezionata] })
      toast.success('Chat resettata con successo')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante il reset della chat')
    },
  })

  const conversazioni = conversazioniData?.conversazioni || []
  const messaggi = messaggiData?.messaggi || []
  const users = usersData?.users || []

  // Trova la conversazione corrente: puo' essere una gia' esistente oppure
  // quella appena aperta e non ancora nata.
  const conversazioneCorrente =
    conversazioneSelezionata === BOZZA
      ? conversazioneBozza
      : conversazioni.find((c: any) => c.conversazione_id === conversazioneSelezionata)

  /*
   * Sul telefono una conversazione aperta prende tutto lo schermo, come in
   * qualunque app di messaggi: intestazione in alto, barra per scrivere in
   * fondo, e con la tastiera aperta tutto sta nell'area che resta visibile.
   * Prima l'intestazione era fissata a 64px dall'alto (l'altezza di una
   * testata che non c'e' piu') e l'altezza veniva da 100vh, che su iPhone
   * e' piu' lungo dello schermo visibile: la barra per scrivere finiva sotto
   * la navigazione.
   */
  const [schermoLargo, setSchermoLargo] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const cambia = () => setSchermoLargo(mq.matches)
    mq.addEventListener('change', cambia)
    return () => mq.removeEventListener('change', cambia)
  }, [])
  const chatAPienoSchermo = !!conversazioneSelezionata && !schermoLargo
  const areaChat = useAreaVisibile(chatAPienoSchermo)
  useBloccaScorrimento(chatAPienoSchermo)
  const [menuChatAperto, setMenuChatAperto] = useState(false)
  useEffect(() => setMenuChatAperto(false), [conversazioneSelezionata])

  // Query per partecipanti del gruppo
  const { data: partecipantiData } = useQuery({
    queryKey: ['messaggi', 'gruppi', conversazioneSelezionata, 'partecipanti'],
    queryFn: async () => {
      if (!conversazioneSelezionata) return { partecipanti: [] }
      const response = await api.get(`/messaggi/gruppi/${conversazioneSelezionata}/partecipanti`)
      return response.data
    },
    enabled: !!conversazioneSelezionata && conversazioneCorrente?.tipo_conversazione === 'gruppo',
  })

  // Filtra utenti: solo admin e soci, escludi se stesso
  const utentiDisponibili = users.filter(
    (u: any) =>
      u.id !== user?.id &&
      u.attivo &&
      (u.ruolo === 'admin' || ['volontario', 'ordinario'].includes(u.categoria_socio))
  )

  // Filtra conversazioni per ricerca
  // La bozza compare in cima all'elenco finche' non diventa una conversazione
  // vera, cosi' chi guarda la colonna di sinistra capisce con chi sta per
  // scrivere invece di vedere una selezione che non corrisponde a niente.
  const conversazioniConBozza = conversazioneBozza
    ? [conversazioneBozza, ...conversazioni]
    : conversazioni

  const conversazioniFiltrate = conversazioniConBozza.filter((conv: any) => {
    if (!searchTerm) return true
    const searchLower = searchTerm.toLowerCase()
    if (conv.tipo_conversazione === 'gruppo') {
      return conv.gruppo_nome?.toLowerCase().includes(searchLower)
    }
    const nomeCompleto = `${conv.altro_utente_nome || ''} ${conv.altro_utente_cognome || ''}`.toLowerCase()
    return nomeCompleto.includes(searchLower)
  })

  // Scroll automatico quando arrivano nuovi messaggi
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messaggi])

  const handleInviaMessaggio = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!nuovoMessaggio.trim() && !allegatoFile) || !conversazioneSelezionata) return

    // Attiva AudioContext quando si invia un messaggio (per permettere notifiche future)
    const audioContext = initAudioContext()
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {})
    }

    const conversazione = conversazioni.find((c: any) => c.conversazione_id === conversazioneSelezionata)
    if (!conversazione) return

    const contenutoOriginale = nuovoMessaggio.trim() || (allegatoFile ? `[Allegato: ${allegatoFile.name}]` : '')
    // I messaggi nuovi partono in chiaro (su HTTPS): la cifratura end-to-end
    // e' stata tolta perche' li rendeva illeggibili da un dispositivo all'altro.
    const contenutoDaInviare = contenutoOriginale
    const crittografato = false
    const iv: string | null = null
    const chiaveEphemeral: string | null = null
    const contenutoMittente: string | null = null
    const ivMittente: string | null = null
    const chiaveEphemeralMittente: string | null = null

    // Se è un gruppo, usa gruppo_id, altrimenti usa conversazione_id e destinatario_id
    if (conversazione.tipo_conversazione === 'gruppo') {
      inviaMessaggioMutation.mutate({
        gruppo_id: conversazione.gruppo_id,
        contenuto: contenutoDaInviare,
        file: allegatoFile || undefined,
        crittografato: false, // I gruppi non supportano ancora E2E
        iv: null,
        chiave_ephemeral: null,
        contenutoOriginale: contenutoOriginale, // Passa il contenuto originale per la cache
      })
    } else {
      inviaMessaggioMutation.mutate({
        // Per una bozza non c'e' ancora un identificativo: lo assegna il
        // server creando la conversazione attorno a questo primo messaggio.
        conversazione_id: conversazioneSelezionata === BOZZA ? undefined : conversazioneSelezionata,
        contenuto: contenutoDaInviare,
        destinatario_id: conversazione.altro_utente_id,
        file: allegatoFile || undefined,
        crittografato,
        iv,
        chiave_ephemeral: chiaveEphemeral,
        contenuto_mittente: contenutoMittente,
        iv_mittente: ivMittente,
        chiave_ephemeral_mittente: chiaveEphemeralMittente,
        contenutoOriginale: contenutoOriginale, // Passa il contenuto originale per la cache
      })
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Verifica dimensione (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File troppo grande. Dimensione massima: 50MB')
      return
    }

    setAllegatoFile(file)

    // Crea preview per immagini
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => {
        setAllegatoPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    } else {
      setAllegatoPreview(null)
    }
  }

  const handlePlayAudio = (audioUrl: string) => {
    if (isPlayingAudio === audioUrl) {
      // Pausa
      if (audioRef.current) {
        audioRef.current.pause()
        setIsPlayingAudio(null)
      }
    } else {
      // Play
      if (audioRef.current) {
        audioRef.current.src = audioUrl
        audioRef.current.play()
        setIsPlayingAudio(audioUrl)
        audioRef.current.onended = () => setIsPlayingAudio(null)
      }
    }
  }

  // AudioContext globale riutilizzabile (creato al primo utilizzo)
  const audioContextRef = useRef<AudioContext | null>(null)
  
  // Inizializza AudioContext al primo click dell'utente (richiesto dai browser)
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass()
        }
      } catch (e) {
        console.error('Errore creazione AudioContext:', e)
      }
    }
    return audioContextRef.current
  }

  // Funzione helper per riprodurre il suono di notifica
  const playNotificationSound = () => {
    try {
      let audioContext = audioContextRef.current
      
      // Se non esiste, prova a crearlo (potrebbe fallire senza interazione utente)
      if (!audioContext) {
        audioContext = initAudioContext()
        if (!audioContext) {
          console.warn('AudioContext non disponibile - potrebbe richiedere interazione utente')
          return
        }
      }
      
      // Se il contesto è sospeso, prova a riprenderlo
      if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
          playNotificationSoundInternal(audioContext!)
        }).catch(() => {
          console.warn('Impossibile riprendere AudioContext')
        })
        return
      }
      
      playNotificationSoundInternal(audioContext)
    } catch (e) {
      console.error('Errore riproduzione audio:', e)
    }
  }

  const playNotificationSoundInternal = (audioContext: AudioContext) => {
    try {
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      oscillator.frequency.value = 800
      oscillator.type = 'sine'
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
      
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.2)
      
      // Non chiudere il contesto, riutilizzalo
      oscillator.onended = () => {
        // Il contesto rimane aperto per riutilizzo
      }
    } catch (e) {
      console.error('Errore riproduzione audio interno:', e)
    }
  }

  // Notifica audio quando arrivano nuovi messaggi
  // Usa un ref per tracciare l'ultimo conteggio di messaggi non letti per evitare suoni duplicati
  const lastUnreadCountRef = useRef<number | null>(null)
  const hasPlayedSoundRef = useRef<boolean>(false)
  
  // Per la conversazione aperta: controlla se arrivano nuovi messaggi
  useEffect(() => {
    if (!notificheAudio || !conversazioneSelezionata || !messaggiData?.messaggi) {
      // Reset quando non ci sono condizioni per suonare
      if (!notificheAudio || !conversazioneSelezionata) {
        lastMessageIdRef.current = null
        hasPlayedSoundRef.current = false
      }
      return
    }

    const messaggi = messaggiData.messaggi
    if (messaggi.length === 0) {
      lastMessageIdRef.current = null
      hasPlayedSoundRef.current = false
      return
    }

    const ultimoMessaggio = messaggi[messaggi.length - 1]
    const lastId = lastMessageIdRef.current
    
    // Se è un nuovo messaggio e non è dell'utente corrente
    if (lastId && ultimoMessaggio.id !== lastId && ultimoMessaggio.mittente_id !== user?.id) {
      // Log solo in modalità sviluppo
      if (import.meta.env.DEV) {
        console.log('Nuovo messaggio rilevato nella conversazione aperta:', ultimoMessaggio.id, 'precedente:', lastId)
      }
      // Assicurati che AudioContext sia inizializzato e attivo
      const audioContext = initAudioContext()
      if (audioContext) {
        // Se sospeso, riprendilo
        if (audioContext.state === 'suspended') {
          audioContext.resume().then(() => {
            playNotificationSound()
          }).catch((err) => {
            console.warn('Impossibile riprendere AudioContext:', err)
          })
        } else {
          playNotificationSound()
        }
      } else {
        // Prova comunque a suonare (potrebbe creare il contesto)
        playNotificationSound()
      }
      lastMessageIdRef.current = ultimoMessaggio.id
      hasPlayedSoundRef.current = true
    } else if (!lastId) {
      // Prima volta che carichi i messaggi, salva l'ID ma non suonare
      lastMessageIdRef.current = ultimoMessaggio.id
      hasPlayedSoundRef.current = false
    }
  }, [messaggiData?.messaggi, notificheAudio, conversazioneSelezionata, user?.id])

  // Controlla i messaggi non letti nelle conversazioni (anche non aperte)
  useEffect(() => {
    if (!notificheAudio || !conversazioniData?.conversazioni) return

    // Calcola il totale dei messaggi non letti
    const totalUnread = conversazioniData.conversazioni.reduce(
      (sum: number, conv: any) => sum + (conv.messaggi_non_letti || 0),
      0
    )

    // Inizializza al primo caricamento senza suonare
    if (lastUnreadCountRef.current === null) {
      lastUnreadCountRef.current = totalUnread
      return
    }

    // Se il conteggio è aumentato e non abbiamo già suonato per questa conversazione aperta
    if (totalUnread > lastUnreadCountRef.current && !hasPlayedSoundRef.current) {
      // Suona solo se non c'è una conversazione aperta
      // (se c'è una conversazione aperta, il suono viene gestito dall'altro useEffect)
      if (!conversazioneSelezionata) {
        // Log solo in modalità sviluppo
        if (import.meta.env.DEV) {
          console.log('Nuovo messaggio rilevato in conversazione non aperta, totale non letti:', totalUnread, 'precedente:', lastUnreadCountRef.current)
        }
        // Assicurati che AudioContext sia inizializzato e attivo
        const audioContext = initAudioContext()
        if (audioContext) {
          // Se sospeso, riprendilo
          if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
              playNotificationSound()
            }).catch((err) => {
              console.warn('Impossibile riprendere AudioContext:', err)
            })
          } else {
            playNotificationSound()
          }
        } else {
          // Prova comunque a suonare (potrebbe creare il contesto)
          playNotificationSound()
        }
        hasPlayedSoundRef.current = true
      }
    }
    
    // Reset il flag quando il conteggio diminuisce (messaggi letti)
    if (totalUnread < lastUnreadCountRef.current) {
      hasPlayedSoundRef.current = false
    }
    
    lastUnreadCountRef.current = totalUnread
  }, [conversazioniData?.conversazioni, notificheAudio, conversazioneSelezionata])

  // Reset quando si cambia conversazione
  useEffect(() => {
    lastMessageIdRef.current = null
    hasPlayedSoundRef.current = false
  }, [conversazioneSelezionata])

  // Inizializza AudioContext quando l'utente interagisce con la pagina (click, invio messaggio, ecc.)
  useEffect(() => {
    // Inizializza AudioContext al primo caricamento della pagina (se possibile)
    // Nota: alcuni browser richiedono comunque un'interazione utente esplicita
    const handleUserInteraction = () => {
      const audioContext = initAudioContext()
      if (audioContext && audioContext.state === 'suspended') {
        // Riprendi il contesto se è sospeso
        audioContext.resume().catch((err) => {
          console.warn('Impossibile riprendere AudioContext:', err)
        })
      }
      // Rimuovi i listener dopo la prima interazione
      document.removeEventListener('click', handleUserInteraction)
      document.removeEventListener('keydown', handleUserInteraction)
      document.removeEventListener('touchstart', handleUserInteraction)
    }
    
    // Aggiungi listener per vari tipi di interazione
    document.addEventListener('click', handleUserInteraction, { once: true })
    document.addEventListener('keydown', handleUserInteraction, { once: true })
    document.addEventListener('touchstart', handleUserInteraction, { once: true })
    
    // Prova anche a inizializzare quando si invia un messaggio
    const handleMessageSend = () => {
      const audioContext = initAudioContext()
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().catch(() => {})
      }
    }
    
    // Aggiungi listener per l'invio di messaggi
    const messageForm = document.querySelector('form[onsubmit]')
    if (messageForm) {
      messageForm.addEventListener('submit', handleMessageSend, { once: true })
    }
    
    return () => {
      document.removeEventListener('click', handleUserInteraction)
      document.removeEventListener('keydown', handleUserInteraction)
      document.removeEventListener('touchstart', handleUserInteraction)
      if (messageForm) {
        messageForm.removeEventListener('submit', handleMessageSend)
      }
    }
  }, [])

  const handleCreaGruppo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGroupForm.nome.trim()) {
      toast.error('Il nome del gruppo è obbligatorio')
      return
    }
    creaGruppoMutation.mutate(newGroupForm)
  }

  const handleIniziaConversazione = (destinatarioId: string) => {
    // Cerca se esiste già una conversazione con questo utente
    const conversazioneEsistente = conversazioni.find(
      (c: any) => c.altro_utente_id === destinatarioId
    )

    if (conversazioneEsistente) {
      setConversazioneBozza(null)
      setConversazioneSelezionata(conversazioneEsistente.conversazione_id)
    } else {
      // Nessun messaggio finto: si apre la finestra e basta.
      const destinatario = users.find((u: any) => u.id === destinatarioId)
      setConversazioneBozza({
        conversazione_id: BOZZA,
        tipo_conversazione: 'privata',
        altro_utente_id: destinatarioId,
        altro_utente_nome: destinatario?.nome || '',
        altro_utente_cognome: destinatario?.cognome || '',
        ultimo_messaggio: null,
        messaggi_non_letti: 0,
      })
      setConversazioneSelezionata(BOZZA)
    }
  }

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-200px)] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-gray-200">
      {/* Sidebar con lista conversazioni */}
      <div className={`${conversazioneSelezionata ? 'hidden lg:flex' : 'flex'} w-full lg:w-80 border-r bg-gray-50 flex-col`}>
        <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-900">Chat</h1>
            <div className="flex gap-2">
              {isAdmin && (
                <button
                  onClick={() => setIsNewGroupModalOpen(true)}
                  className="btn btn-primary btn-sm flex items-center"
                  title="Crea gruppo"
                >
                  <Users className="w-4 h-4 mr-1" />
                </button>
              )}
              <button
                onClick={() => setIsNewChatModalOpen(true)}
                className="btn btn-secondary btn-sm flex items-center"
                title="Nuova chat"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cerca conversazioni..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoadingConversazioni ? (
            <div className="p-4 text-center text-gray-500">Caricamento...</div>
          ) : conversazioniFiltrate.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              {searchTerm ? 'Nessuna conversazione trovata' : 'Nessuna conversazione'}
            </div>
          ) : (
            <div className="divide-y">
              {conversazioniFiltrate.map((conv: any) => {
                const isGruppo = conv.tipo_conversazione === 'gruppo'
                const nomeDisplay = isGruppo 
                  ? conv.gruppo_nome 
                  : `${conv.altro_utente_nome || ''} ${conv.altro_utente_cognome || ''}`.trim()
                
                return (
                  <button
                    key={conv.conversazione_id}
                    onClick={() => setConversazioneSelezionata(conv.conversazione_id)}
                    className={`w-full p-4 text-left hover:bg-gray-100 transition-colors ${
                      conversazioneSelezionata === conv.conversazione_id ? 'bg-primary-50 border-l-4 border-primary-600' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isGruppo && conv.foto_profilo ? (
                        <img
                          src={getFileUrl(conv.foto_profilo)}
                          alt={conv.gruppo_nome}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isGruppo ? 'bg-purple-100' : 'bg-primary-100'
                        }`}>
                          {isGruppo ? (
                            <Users className={`w-5 h-5 ${conv.tipo_gruppo === 'generale' ? 'text-purple-600' : 'text-purple-600'}`} />
                          ) : (
                            <User className="w-5 h-5 text-primary-600" />
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-gray-900 truncate">
                            {nomeDisplay || 'Chat'}
                            {conv.tipo_gruppo === 'generale' && (
                              <span className="ml-2 text-xs text-purple-600 font-normal">(Generale)</span>
                            )}
                          </p>
                          {conv.messaggi_non_letti > 0 && (
                            <span className="px-2 py-0.5 bg-red-500 text-white rounded-full text-xs">
                              {conv.messaggi_non_letti}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 truncate">{conv.ultimo_messaggio || 'Nessun messaggio'}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {conv.ultimo_messaggio_data &&
                            format(new Date(conv.ultimo_messaggio_data), 'd MMM, HH:mm', { locale: it })}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Lista utenti per iniziare nuove conversazioni */}
          {utentiDisponibili.length > 0 && (
            <div className="border-t p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Inizia una conversazione</h3>
              <div className="space-y-2 lg:max-h-60 lg:overflow-y-auto">
                {utentiDisponibili
                  .filter((u: any) => !conversazioni.some((c: any) => c.altro_utente_id === u.id))
                  .map((u: any) => (
                    <button
                      key={u.id}
                      onClick={() => handleIniziaConversazione(u.id)}
                      className="w-full p-2 text-left hover:bg-gray-100 rounded flex items-center gap-2"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                        <User className="w-4 h-4 text-gray-600" />
                      </div>
                      <span className="text-sm text-gray-700">
                        {u.nome} {u.cognome}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Area chat */}
      <div
        className={`${conversazioneSelezionata ? 'flex' : 'hidden lg:flex'} min-h-0 flex-1 flex-col bg-gray-50 ${
          chatAPienoSchermo ? 'fixed inset-x-0 top-0 z-50 h-[100dvh]' : ''
        }`}
        style={chatAPienoSchermo && areaChat ? { height: areaChat.altezza, top: areaChat.alto } : undefined}
      >
        {conversazioneSelezionata && conversazioneCorrente ? (
          <>
            {/* Intestazione della conversazione */}
            {(() => {
              const gruppo = conversazioneCorrente.tipo_conversazione === 'gruppo'
              const nome = gruppo
                ? conversazioneCorrente.gruppo_nome
                : `${conversazioneCorrente.altro_utente_nome || ''} ${conversazioneCorrente.altro_utente_cognome || ''}`.trim()
              const dettaglio = [
                gruppo
                  ? conversazioneCorrente.gruppo_descrizione || (conversazioneCorrente.tipo_gruppo === 'generale' ? 'Gruppo di tutti i soci' : 'Gruppo')
                  : conversazioneCorrente.altro_utente_ruolo === 'admin' ? 'Admin' : conversazioneCorrente.altro_utente_categoria,
              ].filter(Boolean).join('')
              const azioniAdmin = isAdmin && (
                <div className="relative flex-none">
                  <button
                    type="button"
                    onClick={() => setMenuChatAperto(!menuChatAperto)}
                    aria-label="Altre azioni"
                    aria-expanded={menuChatAperto}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                  {menuChatAperto && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuChatAperto(false)} />
                      <div className="absolute right-0 top-12 z-20 w-60 overflow-hidden rounded-2xl border border-gray-200 bg-white py-1 shadow-lg">
                        {gruppo && (
                          <button
                            type="button"
                            onClick={() => {
                              setMenuChatAperto(false)
                              setIsSettingsModalOpen(true)
                            }}
                            className="flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-[15px] text-gray-900 hover:bg-gray-50"
                          >
                            <Settings className="h-5 w-5 text-gray-500" />
                            Impostazioni del gruppo
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setMenuChatAperto(false)
                            if (confirm('Svuotare questa chat? Tutti i messaggi verranno eliminati per tutti, e non si possono recuperare.')) {
                              resettaChatMutation.mutate(conversazioneSelezionata)
                            }
                          }}
                          disabled={resettaChatMutation.isPending}
                          className="flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-[15px] text-red-700 hover:bg-red-50"
                        >
                          <RotateCcw className="h-5 w-5" />
                          Svuota la chat
                        </button>
                        {gruppo && conversazioneCorrente.tipo_gruppo !== 'generale' && (
                          <button
                            type="button"
                            onClick={() => {
                              setMenuChatAperto(false)
                              if (confirm('Eliminare questo gruppo? Non si può annullare.')) {
                                eliminaGruppoMutation.mutate(conversazioneCorrente.gruppo_id)
                              }
                            }}
                            disabled={eliminaGruppoMutation.isPending}
                            className="flex min-h-[48px] w-full items-center gap-3 px-4 text-left text-[15px] text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-5 w-5" />
                            Elimina il gruppo
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )
              return (
                <div
                  className="flex flex-none items-center gap-1 border-b border-gray-200 bg-white py-2 pl-1 pr-2 lg:gap-3 lg:px-4 lg:py-3"
                  style={chatAPienoSchermo ? { paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' } : undefined}
                >
                  <button
                    type="button"
                    onClick={() => setConversazioneSelezionata(null)}
                    aria-label="Torna alle conversazioni"
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-gray-700 hover:bg-gray-100 lg:hidden"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  {gruppo && messaggiData?.gruppo?.foto_profilo ? (
                    <img
                      src={getFileUrl(messaggiData.gruppo.foto_profilo)}
                      alt=""
                      className="h-10 w-10 flex-none rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary-100 text-primary-700">
                      {gruppo ? <Users className="h-5 w-5" /> : <span className="font-display text-base font-bold">{(nome[0] || '?').toUpperCase()}</span>}
                    </div>
                  )}
                  <div className="ml-2 min-w-0 flex-1">
                    <p className="truncate text-[16px] font-bold leading-tight text-gray-900">{nome}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-gray-500">
                      {dettaglio && <span className="iniziale-maiuscola truncate">{dettaglio}</span>}
                    </p>
                  </div>
                  {azioniAdmin}
                </div>
              )
            })()}

            {/* Messaggi */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-50 p-4">
              {isLoadingMessaggi ? (
                <div className="py-10 text-center text-gray-500">Carico i messaggi…</div>
              ) : messaggi.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                  <MessageSquare className="mb-3 h-10 w-10 text-gray-300" />
                  <p className="font-semibold text-gray-900">Ancora nessun messaggio</p>
                  <p className="mt-1 text-sm text-gray-500">Scrivi tu il primo, qui sotto.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messaggi.map((msg: any) => {
                    const isMittente = msg.mittente_id === user?.id
                    const isGruppo = messaggiData?.gruppo !== undefined
                    // Verifica se il messaggio può essere modificato (entro 10 minuti)
                    const dataInvio = new Date(msg.created_at)
                    const minutiTrascorsi = (Date.now() - dataInvio.getTime()) / (1000 * 60)
                    const puoModificare = isMittente && minutiTrascorsi <= 10 && !msg.modificato && !msg.tipo_allegato
                    
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMittente ? 'justify-end' : 'justify-start'} group`}
                        onMouseEnter={() => setMessaggioHovered(msg.id)}
                        onMouseLeave={() => setMessaggioHovered(null)}
                      >
                        <div
                          className={`relative max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                            isMittente
                              ? 'bg-primary-600 text-white'
                              : 'bg-white text-gray-900 border'
                          }`}
                        >
                          {isGruppo && !isMittente && (
                            <p className={`text-xs font-semibold mb-1 ${
                              isMittente ? 'text-primary-100' : 'text-gray-600'
                            }`}>
                              {msg.mittente_nome} {msg.mittente_cognome}
                            </p>
                          )}
                          
                          {/* Allegato */}
                          {msg.tipo_allegato && msg.allegato_path && (
                            <div className="mb-2">
                              {msg.tipo_allegato === 'immagine' && (
                                <img
                                  src={getFileUrl(msg.allegato_path)}
                                  alt={msg.allegato_nome}
                                  className="max-w-full rounded-lg mb-2"
                                />
                              )}
                              {msg.tipo_allegato === 'audio' && (
                                <div className="flex items-center gap-2 p-2 bg-black bg-opacity-20 rounded">
                                  <button
                                    onClick={() => handlePlayAudio(getFileUrl(msg.allegato_path))}
                                    className="p-2 rounded-full bg-white bg-opacity-20 hover:bg-opacity-30"
                                  >
                                    {isPlayingAudio === getFileUrl(msg.allegato_path) ? (
                                      <Pause className="w-4 h-4" />
                                    ) : (
                                      <Play className="w-4 h-4" />
                                    )}
                                  </button>
                                  <span className="text-xs flex-1 truncate">{msg.allegato_nome}</span>
                                </div>
                              )}
                              {msg.tipo_allegato === 'video' && (
                                <video
                                  src={getFileUrl(msg.allegato_path)}
                                  controls
                                  className="max-w-full rounded-lg mb-2"
                                />
                              )}
                              {msg.tipo_allegato === 'documento' && (
                                <a
                                  href={getFileUrl(msg.allegato_path)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 p-2 bg-black bg-opacity-20 rounded hover:bg-opacity-30"
                                >
                                  <File className="w-4 h-4" />
                                  <span className="text-xs flex-1 truncate">{msg.allegato_nome}</span>
                                </a>
                              )}
                            </div>
                          )}
                          
                          {msg.contenuto && (
                            <p className="text-sm whitespace-pre-wrap">{msg.contenuto}</p>
                          )}
                          {msg.modificato && (
                            <p className={`text-[10px] italic mt-1 ${
                              isMittente ? 'text-primary-200' : 'text-gray-400'
                            }`}>
                              (modificato)
                            </p>
                          )}
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-2">
                              <p
                                className={`text-xs ${
                                  isMittente ? 'text-primary-100' : 'text-gray-400'
                                }`}
                              >
                                {format(new Date(msg.created_at), 'HH:mm', { locale: it })}
                              </p>
                            </div>
                            {/* Pulsanti modifica/elimina (solo per i propri messaggi) */}
                            {isMittente && messaggioHovered === msg.id && (
                              <div className="flex items-center gap-1 ml-2">
                                {puoModificare && (
                                  <button
                                    onClick={() => {
                                      setMessaggioDaModificare(msg)
                                      setContenutoModificato(msg.contenuto || '')
                                      setIsEditModalOpen(true)
                                    }}
                                    className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-opacity-20 ${
                                      isMittente ? 'hover:bg-white' : 'hover:bg-gray-200'
                                    }`}
                                    title="Modifica messaggio"
                                  >
                                    <Edit className={`w-4 h-4 ${isMittente ? 'text-primary-100' : 'text-gray-600'}`} />
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    if (confirm('Sei sicuro di voler eliminare questo messaggio?')) {
                                      eliminaMessaggioMutation.mutate(msg.id)
                                    }
                                  }}
                                  className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-opacity-20 ${
                                    isMittente ? 'hover:bg-white' : 'hover:bg-gray-200'
                                  }`}
                                  title="Elimina messaggio"
                                  disabled={eliminaMessaggioMutation.isPending}
                                >
                                  <Trash2 className={`w-4 h-4 ${isMittente ? 'text-primary-100' : 'text-red-600'}`} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input messaggio */}
            <form
              onSubmit={handleInviaMessaggio}
              className="flex-none border-t border-gray-200 bg-white px-2 pt-2 lg:p-4"
              style={{ paddingBottom: chatAPienoSchermo ? 'max(0.5rem, env(safe-area-inset-bottom))' : undefined }}
            >
              {/* Preview allegato */}
              {allegatoPreview && (
                <div className="mb-2 relative">
                  <img
                    src={allegatoPreview}
                    alt="Preview"
                    className="max-w-xs rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setAllegatoFile(null)
                      setAllegatoPreview(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    aria-label="Togli l'immagine allegata"
                    className="absolute top-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-gray-900/80 text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {allegatoFile && !allegatoPreview && (
                <div className="mb-2 flex items-center gap-2 p-2 bg-gray-100 rounded">
                  {allegatoFile.type.startsWith('audio/') && <Mic className="w-4 h-4" />}
                  {allegatoFile.type.startsWith('video/') && <Video className="w-4 h-4" />}
                  {!allegatoFile.type.startsWith('audio/') && !allegatoFile.type.startsWith('video/') && !allegatoFile.type.startsWith('image/') && <File className="w-4 h-4" />}
                  <span className="text-sm flex-1 truncate">{allegatoFile.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setAllegatoFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    aria-label="Togli l'allegato"
                    className="flex h-11 w-11 flex-none items-center justify-center rounded-xl hover:bg-gray-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              
              <div className="flex items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-input"
                />
                <label
                  htmlFor="file-input"
                  className="flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-full hover:bg-gray-100"
                  title="Allega un file"
                  aria-label="Allega un file"
                >
                  <Paperclip className="w-5 h-5 text-gray-600" />
                </label>
                <input
                  type="text"
                  value={nuovoMessaggio}
                  onChange={(e) => setNuovoMessaggio(e.target.value)}
                  placeholder="Scrivi un messaggio"
                  aria-label="Scrivi un messaggio"
                  enterKeyHint="send"
                  className="input min-h-[44px] min-w-0 flex-1 rounded-full px-4 text-base"
                  disabled={inviaMessaggioMutation.isPending}
                />
                <button
                  type="submit"
                  aria-label="Invia"
                  className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-gray-900 text-white transition hover:bg-gray-800 disabled:bg-gray-300"
                  disabled={(!nuovoMessaggio.trim() && !allegatoFile) || inviaMessaggioMutation.isPending}
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </form>
            
            {/* Audio element nascosto per riproduzione */}
            <audio ref={audioRef} className="hidden" />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Seleziona una conversazione per iniziare a chattare</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal Nuova Chat */}
      <Modal
        isOpen={isNewChatModalOpen}
        onClose={() => setIsNewChatModalOpen(false)}
        title="Nuova Conversazione"
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (newChatRecipient) {
              handleIniziaConversazione(newChatRecipient)
              setIsNewChatModalOpen(false)
              setNewChatRecipient('')
            }
          }}
        >
          <FormSelect
            label="Seleziona Destinatario"
            id="new-chat-recipient"
            value={newChatRecipient}
            onChange={(e) => setNewChatRecipient(e.target.value)}
            options={[
              { value: '', label: 'Seleziona un utente' },
              ...utentiDisponibili.map((u: any) => ({
                value: u.id,
                label: u.email ? `${u.nome} ${u.cognome} (${u.email})` : `${u.nome} ${u.cognome}`,
              })),
            ]}
            required
          />
          <div className="flex justify-end gap-4 mt-6">
            <button
              type="button"
              onClick={() => setIsNewChatModalOpen(false)}
              className="btn btn-secondary"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!newChatRecipient}
            >
              Avvia Chat
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Crea Gruppo */}
      <Modal
        isOpen={isNewGroupModalOpen}
        onClose={() => setIsNewGroupModalOpen(false)}
        title="Crea Nuovo Gruppo"
        size="md"
      >
        <form onSubmit={handleCreaGruppo}>
          <FormInput
            label="Nome Gruppo"
            id="nome-gruppo"
            type="text"
            value={newGroupForm.nome}
            onChange={(e) => setNewGroupForm({ ...newGroupForm, nome: e.target.value })}
            required
            placeholder="Es: Team Cucina"
          />

          <FormTextarea
            label="Descrizione (opzionale)"
            id="descrizione-gruppo"
            value={newGroupForm.descrizione}
            onChange={(e) => setNewGroupForm({ ...newGroupForm, descrizione: e.target.value })}
            rows={3}
            placeholder="Descrizione del gruppo..."
          />

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Partecipanti (opzionale)
            </label>
            <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg p-3">
              {utentiDisponibili.map((u: any) => (
                <label
                  key={u.id}
                  className="flex items-center p-2 hover:bg-gray-50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={newGroupForm.partecipanti.includes(u.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setNewGroupForm({
                          ...newGroupForm,
                          partecipanti: [...newGroupForm.partecipanti, u.id],
                        })
                      } else {
                        setNewGroupForm({
                          ...newGroupForm,
                          partecipanti: newGroupForm.partecipanti.filter((id) => id !== u.id),
                        })
                      }
                    }}
                    className="mr-3"
                  />
                  <span className="text-sm text-gray-700">
                    {u.nome} {u.cognome}{u.email ? ` (${u.email})` : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-6">
            <button
              type="button"
              onClick={() => {
                setIsNewGroupModalOpen(false)
                setNewGroupForm({ nome: '', descrizione: '', partecipanti: [] })
              }}
              className="btn btn-secondary"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={creaGruppoMutation.isPending || !newGroupForm.nome.trim()}
            >
              {creaGruppoMutation.isPending ? 'Creazione...' : 'Crea Gruppo'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Impostazioni Gruppo */}
      <Modal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        title="Impostazioni Gruppo"
        size="lg"
      >
        {conversazioneCorrente?.tipo_conversazione === 'gruppo' && (
          <div className="space-y-6 p-2 sm:p-4">
            {/* Foto Profilo */}
            <div className="border-b pb-4">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Foto Profilo
              </label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                {messaggiData?.gruppo?.foto_profilo ? (
                  <img
                    src={getFileUrl(messaggiData.gruppo.foto_profilo)}
                    alt={conversazioneCorrente.gruppo_nome}
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover border-2 border-gray-200 shadow-sm"
                  />
                ) : (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center border-2 border-gray-200 shadow-sm">
                    <Users className="w-12 h-12 sm:w-14 sm:h-14 text-purple-600" />
                  </div>
                )}
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        cambiaFotoGruppoMutation.mutate({
                          gruppoId: conversazioneCorrente.gruppo_id,
                          file,
                        })
                      }
                    }}
                    className="hidden"
                    id="foto-gruppo-input"
                    disabled={cambiaFotoGruppoMutation.isPending}
                  />
                  <label
                    htmlFor="foto-gruppo-input"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg cursor-pointer transition-colors text-sm font-medium"
                  >
                    <Image className="w-4 h-4" />
                    {cambiaFotoGruppoMutation.isPending ? 'Caricamento...' : 'Cambia Foto'}
                  </label>
                  <p className="text-xs text-gray-500 mt-2">
                    Formati supportati: JPG, PNG, GIF (max 5MB)
                  </p>
                </div>
              </div>
            </div>

            {/* Partecipanti */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-gray-900">
                  Partecipanti
                </label>
                <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {partecipantiData?.partecipanti?.length || 0}
                </span>
              </div>
              <div className="border border-gray-200 rounded-lg bg-gray-50 max-h-64 sm:max-h-80 overflow-y-auto">
                {partecipantiData?.partecipanti && partecipantiData.partecipanti.length > 0 ? (
                  <div className="divide-y divide-gray-200">
                    {partecipantiData.partecipanti.map((part: any, index: number) => {
                      const isCurrentUser = part.user_id === user?.id
                      const isUserAdmin = part.ruolo === 'admin' || part.ruolo_gruppo === 'admin'
                      const canRemove = (isAdmin || isUserAdmin) && !isCurrentUser && conversazioneCorrente.tipo_gruppo !== 'generale'
                      
                      return (
                        <div
                          key={part.id || part.user_id || index}
                          className="flex items-center justify-between p-3 hover:bg-white transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center flex-shrink-0">
                              <User className="w-5 h-5 text-primary-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {part.nome} {part.cognome}
                                {isCurrentUser && (
                                  <span className="ml-2 text-xs text-primary-600 font-normal">(Tu)</span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {part.email}
                                {isUserAdmin && (
                                  <span className="ml-2 text-primary-600 font-medium">• Admin</span>
                                )}
                              </p>
                            </div>
                          </div>
                          {canRemove && (
                            <button
                              onClick={() => {
                                if (confirm(`Rimuovere ${part.nome} ${part.cognome} dal gruppo?`)) {
                                  rimuoviPartecipanteMutation.mutate({
                                    gruppoId: conversazioneCorrente.gruppo_id,
                                    userId: part.user_id,
                                  })
                                }
                              }}
                              className="ml-2 p-2 hover:bg-red-50 rounded-lg text-red-600 transition-colors flex-shrink-0"
                              title="Rimuovi partecipante"
                              disabled={rimuoviPartecipanteMutation.isPending}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-center text-gray-500">
                    <Users className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">Nessun partecipante</p>
                  </div>
                )}
              </div>
            </div>

            {/* Notifiche Audio */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-3 cursor-pointer group flex-1">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={notificheAudio}
                      onChange={(e) => setNotificheAudio(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900 block">
                      Notifiche audio
                    </span>
                    <span className="text-xs text-gray-500">
                      Attiva un suono quando arrivano nuovi messaggi
                    </span>
                  </div>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    // Inizializza AudioContext al click (richiesto dai browser)
                    initAudioContext()
                    playNotificationSound()
                    toast.success('Test audio riprodotto!')
                  }}
                  className="min-h-[44px] px-4 text-sm font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors"
                  title="Testa il suono di notifica (attiva anche l'audio per le notifiche future)"
                >
                  Test Audio
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Chiudi
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Modifica Messaggio */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false)
          setMessaggioDaModificare(null)
          setContenutoModificato('')
        }}
        title="Modifica Messaggio"
        size="md"
      >
        {messaggioDaModificare && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (contenutoModificato.trim()) {
                modificaMessaggioMutation.mutate({
                  messaggioId: messaggioDaModificare.id,
                  contenuto: contenutoModificato.trim()
                })
              }
            }}
          >
            <FormTextarea
              label="Contenuto"
              id="contenuto-modificato"
              value={contenutoModificato}
              onChange={(e) => setContenutoModificato(e.target.value)}
              rows={5}
              required
              placeholder="Scrivi il messaggio modificato..."
            />
            <p className="text-xs text-gray-500 mt-2">
              Puoi modificare un messaggio solo entro 10 minuti dall'invio.
            </p>
            <div className="flex justify-end gap-4 mt-6">
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false)
                  setMessaggioDaModificare(null)
                  setContenutoModificato('')
                }}
                className="btn btn-secondary"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!contenutoModificato.trim() || modificaMessaggioMutation.isPending}
              >
                {modificaMessaggioMutation.isPending ? 'Modifica in corso...' : 'Salva Modifiche'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

export default Messaggi

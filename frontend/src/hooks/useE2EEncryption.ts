import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../services/authService'
import {
  importPublicKey,
  encryptE2EMessageDoppia,
  decryptE2EMessage,
  loadPrivateKey,
} from '../services/cryptoService'
import toast from 'react-hot-toast'

interface UseE2EEncryptionReturn {
  isInitialized: boolean
  isEncryptionEnabled: boolean
  initializeKeys: () => Promise<void>
  encryptMessage: (message: string, recipientId: string) => Promise<{
    encryptedContent: string
    iv: string
    ephemeralPublicKey: string
    senderContent: string
    senderIv: string
    senderEphemeralPublicKey: string
  } | null>
  decryptMessage: (encryptedMessage: {
    encryptedContent: string
    iv: string
    ephemeralPublicKey: string
  }, senderId: string) => Promise<string | null>
  enableEncryption: () => void
  disableEncryption: () => void
}

/**
 * Una preparazione delle chiavi per utente, condivisa da tutte le parti
 * dell'app che usano questo hook.
 *
 * Prima Layout e Messaggi la facevano ognuno per conto proprio e nello
 * stesso istante: su un dispositivo senza chiave ne generavano DUE, una
 * finiva salvata qui e l'altra sul server. Da quel momento il dispositivo
 * aveva una privata che non faceva coppia con la pubblica a suo nome: non
 * rileggeva i propri messaggi ne' quelli ricevuti.
 */
const preparazioni = new Map<string, Promise<CryptoKey | null>>()

/**
 * La cifratura end-to-end della chat e' stata tolta: i messaggi nuovi viaggiano
 * in chiaro su HTTPS. Una chiave per persona, conservata solo nel browser, non
 * reggeva l'uso da piu' dispositivi e spariva quando Safari svuota i dati dei
 * siti, portandosi via i messaggi. Qui resta solo la lettura: se questo
 * dispositivo ha ancora la chiave di allora, i messaggi vecchi si decifrano;
 * nessuna chiave nuova viene generata ne' registrata.
 */
async function preparaChiavi(userId: string): Promise<CryptoKey | null> {
  return loadPrivateKey(userId)
}

/**
 * Hook per gestire la crittografia end-to-end
 */
export function useE2EEncryption(): UseE2EEncryptionReturn {
  const { user } = useAuth()
  const [isInitialized, setIsInitialized] = useState(false)
  const [isEncryptionEnabled, setIsEncryptionEnabled] = useState(false)
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null)
  const [publicKeysCache, setPublicKeysCache] = useState<Map<string, CryptoKey>>(new Map())

  // Carica le preferenze di crittografia
  useEffect(() => {
    if (user?.id) {
      const enabled = localStorage.getItem(`e2e_enabled_${user.id}`) === 'true'
      setIsEncryptionEnabled(enabled)
    }
  }, [user?.id])

  // Inizializza le chiavi al primo utilizzo
  const initializeKeys = useCallback(async () => {
    if (!user?.id) return

    // Layout e pagina Messaggi chiamano questa funzione insieme, ognuno con il
    // proprio stato: la preparazione vera e' una sola per utente, condivisa.
    let preparazione = preparazioni.get(user.id)
    if (!preparazione) {
      preparazione = preparaChiavi(user.id)
      preparazioni.set(user.id, preparazione)
      // Se fallisce, al prossimo tentativo si riprova da capo.
      preparazione.catch(() => preparazioni.delete(user.id))
    }

    try {
      const chiave = await preparazione
      if (chiave) setPrivateKey(chiave)
      // La propria pubblica potrebbe essere appena cambiata: niente copia vecchia in cache.
      setPublicKeysCache((prima) => {
        if (!prima.has(user.id)) return prima
        const dopo = new Map(prima)
        dopo.delete(user.id)
        return dopo
      })
      setIsInitialized(true)
    } catch (error: any) {
      console.error('Errore inizializzazione chiavi:', error)
      toast.error('Errore durante l\'inizializzazione della crittografia')
    }
  }, [user?.id])

  // Recupera la chiave pubblica di un utente
  // Ritorna null se non disponibile, e un flag per indicare se è un 404 (utente senza chiave)
  const getPublicKey = useCallback(async (userId: string): Promise<{ key: CryptoKey | null; hasKey: boolean }> => {
    // Controlla la cache
    if (publicKeysCache.has(userId)) {
      return { key: publicKeysCache.get(userId)!, hasKey: true }
    }

    try {
      const response = await api.get(`/chiavi/pubblica/${userId}`)
      const chiavePubblicaJWK = response.data.chiave.chiave_pubblica
      const publicKey = await importPublicKey(chiavePubblicaJWK)

      // Salva in cache
      setPublicKeysCache(prev => new Map(prev).set(userId, publicKey))

      return { key: publicKey, hasKey: true }
    } catch (error: any) {
      // 404 è normale se l'utente non ha ancora generato la chiave pubblica
      if (error.response?.status === 404) {
        // Non loggare come errore, è un caso normale
        return { key: null, hasKey: false }
      }
      // Per altri errori, logga solo in sviluppo
      if (import.meta.env.DEV) {
        console.warn(`Chiave pubblica non disponibile per ${userId}:`, error.response?.status || error.message)
      }
      return { key: null, hasKey: false }
    }
  }, [publicKeysCache])

  // Crittografa un messaggio
  const encryptMessage = useCallback(async (
    message: string,
    recipientId: string
  ): Promise<{
    encryptedContent: string
    iv: string
    ephemeralPublicKey: string
    senderContent: string
    senderIv: string
    senderEphemeralPublicKey: string
  } | null> => {
    if (!isEncryptionEnabled || !privateKey || !user?.id) {
      return null
    }

    try {
      // Serve la pubblica del destinatario e anche la propria: il messaggio
      // viene cifrato due volte, altrimenti chi lo scrive non puo' rileggerlo.
      const [{ key: recipientPublicKey }, { key: senderPublicKey }] = await Promise.all([
        getPublicKey(recipientId),
        getPublicKey(user.id),
      ])

      // Chiave pubblica non disponibile: il destinatario non ha ancora aperto
      // l'app, oppure le nostre chiavi non sono ancora sul server. Il
      // messaggio parte in chiaro, che e' il comportamento previsto.
      if (!recipientPublicKey || !senderPublicKey) {
        return null
      }

      const { perDestinatario, perMittente } = await encryptE2EMessageDoppia(
        message, recipientPublicKey, senderPublicKey, privateKey
      )

      return {
        encryptedContent: perDestinatario.encryptedContent,
        iv: perDestinatario.iv,
        ephemeralPublicKey: perDestinatario.ephemeralPublicKey,
        senderContent: perMittente.encryptedContent,
        senderIv: perMittente.iv,
        senderEphemeralPublicKey: perMittente.ephemeralPublicKey,
      }
    } catch (error: any) {
      console.error('Errore crittografia messaggio:', error)
      toast.error('Errore durante la crittografia del messaggio')
      return null
    }
  }, [isEncryptionEnabled, privateKey, getPublicKey, user?.id])

  // Decrittografa un messaggio
  const decryptMessage = useCallback(async (
    encryptedMessage: {
      encryptedContent: string
      iv: string
      ephemeralPublicKey: string
    },
    _senderId: string
  ): Promise<string | null> => {
    if (!privateKey) {
      return null
    }

    try {
      const decrypted = await decryptE2EMessage(encryptedMessage, privateKey)
      return decrypted
    } catch (error: any) {
      console.error('Errore decrittografia messaggio:', error)
      // Se la decrittografia fallisce, potrebbe essere un messaggio non crittografato
      return null
    }
  }, [privateKey])

  // Abilita la crittografia
  const enableEncryption = useCallback(() => {
    if (!user?.id) return

    setIsEncryptionEnabled(true)
    localStorage.setItem(`e2e_enabled_${user.id}`, 'true')

    // Inizializza le chiavi se non già fatto
    if (!isInitialized) {
      initializeKeys()
    }

    toast.success('Crittografia end-to-end abilitata!')
  }, [user?.id, isInitialized, initializeKeys])

  // Disabilita la crittografia
  const disableEncryption = useCallback(() => {
    if (!user?.id) return

    setIsEncryptionEnabled(false)
    localStorage.setItem(`e2e_enabled_${user.id}`, 'false')
    toast.success('Crittografia end-to-end disabilitata')
  }, [user?.id])

  return {
    isInitialized,
    isEncryptionEnabled,
    initializeKeys,
    encryptMessage,
    decryptMessage,
    enableEncryption,
    disableEncryption
  }
}


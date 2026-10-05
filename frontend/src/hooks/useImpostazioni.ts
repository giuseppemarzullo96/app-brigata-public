import { useQuery } from '@tanstack/react-query'
import { api } from '../services/authService'

/**
 * Impostazioni decise dagli amministratori, lette una volta e tenute in cache.
 *
 * L'endpoint è aperto a ogni socio autenticato: serve a mostrare la quota e,
 * da qui, a sapere quali sezioni sono accese.
 */
export function useImpostazioni() {
  return useQuery({
    queryKey: ['impostazioni'],
    queryFn: async () => (await api.get('/impostazioni')).data,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

/**
 * I messaggi interni sono accesi?
 *
 * Finché la risposta non è arrivata si risponde `true`: la sezione resta com'è
 * invece di sparire e ricomparire a ogni caricamento. È il server a rifiutare
 * le richieste quando la chat è spenta, quindi un attimo di ottimismo qui non
 * apre niente a nessuno.
 */
export function useChatAttiva(): boolean {
  const { data } = useImpostazioni()
  const riga = data?.impostazioni?.find((i: any) => i.chiave === 'chat_attiva')
  return riga ? riga.valore !== 'false' : true
}

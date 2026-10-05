import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Cache per /auth/me per evitare chiamate multiple
let meCache: { data: any; timestamp: number } | null = null
const ME_CACHE_DURATION = 5000 // 5 secondi di cache

// Interceptor per aggiungere token a tutte le richieste
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Variabile per tracciare se stiamo già reindirizzando al login
let isRedirecting = false

// Interceptor per gestire errori 401 e 403
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Gestisci 401 (non autorizzato) - reindirizza al login
    if (error.response?.status === 401 && !isRedirecting) {
      isRedirecting = true
      localStorage.removeItem('token')
      // Evita loop infiniti: reindirizza solo se non siamo già nella pagina di login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    // Gestisci 403 (sospeso) - non reindirizzare, lascia che il componente gestisca il messaggio
    // Solo se non è già nella pagina di login (per evitare loop)
    if (error.response?.status === 403 && error.response?.data?.sospeso && window.location.pathname !== '/login') {
      // Se l'utente è sospeso e ha un token, rimuovilo e reindirizza al login
      localStorage.removeItem('token')
      if (!isRedirecting) {
        isRedirecting = true
        window.location.href = '/login'
      }
    }
    // Gestisci anche errori 429 (Too Many Requests)
    if (error.response?.status === 429) {
      console.warn('Troppe richieste, attendere prima di riprovare')
    }
    // Non loggare 404 per chiavi pubbliche (è normale se l'utente non ha ancora generato la chiave)
    if (error.response?.status === 404 && error.config?.url?.includes('/chiavi/pubblica/')) {
      // Silenzioso: è un caso normale
      error.suppressLog = true
    }
    return Promise.reject(error)
  }
)

export const authService = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login', { email, password })
    // Invalida cache dopo login
    meCache = null
    return response.data
  },

  logout: async () => {
    await api.post('/auth/logout')
    // Invalida cache dopo logout
    meCache = null
  },

  getCurrentUser: async (forceRefresh = false) => {
    // Usa cache se disponibile e non è una richiesta forzata
    if (!forceRefresh && meCache) {
      const now = Date.now()
      if (now - meCache.timestamp < ME_CACHE_DURATION) {
        return meCache.data
      }
    }

    try {
      const response = await api.get('/auth/me')
      const userData = response.data.user
      // Aggiorna cache
      meCache = {
        data: userData,
        timestamp: Date.now()
      }
      return userData
    } catch (error: any) {
      // Invalida cache in caso di errore (tranne 429)
      if (error.response?.status !== 429) {
        meCache = null
      }
      throw error
    }
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const response = await api.post('/auth/change-password', {
      currentPassword,
      newPassword,
    })
    return response.data
  },
}

export { api }
export default api


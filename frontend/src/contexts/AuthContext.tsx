import React, { createContext, useContext, useState, useEffect } from 'react'
import { authService } from '../services/authService'

interface User {
  id: string
  email: string
  nome: string
  cognome: string
  ruolo: string
  categoria_socio: string
  foto_profilo?: string
  sospeso?: boolean
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  token: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    let retryCount = 0
    const maxRetries = 3
    
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token')
      if (storedToken) {
        try {
          const userData = await authService.getCurrentUser()
          if (isMounted) {
            setUser(userData)
            setToken(storedToken)
            retryCount = 0 // Reset retry count on success
          }
        } catch (error: any) {
          // Gestisci errori 429 (rate limit) con retry esponenziale
          if (error.response?.status === 429) {
            if (retryCount < maxRetries && isMounted) {
              retryCount++
              const delay = Math.min(1000 * Math.pow(2, retryCount), 10000) // Backoff esponenziale, max 10s
              console.warn(`Rate limit raggiunto, riprovo tra ${delay}ms (tentativo ${retryCount}/${maxRetries})`)
              setTimeout(() => {
                if (isMounted) {
                  initAuth()
                }
              }, delay)
              return // Non impostare loading a false, riproverà
            } else {
              console.error('Troppi tentativi falliti a causa del rate limit')
              // Non rimuovere il token, potrebbe essere solo un problema temporaneo
            }
          } else if (error.response?.status !== 429 && isMounted) {
            // Per altri errori, rimuovi il token
            localStorage.removeItem('token')
            setToken(null)
          }
        }
      }
      if (isMounted) {
        setLoading(false)
      }
    }

    initAuth()
    
    return () => {
      isMounted = false
    }
  }, [])

  const login = async (email: string, password: string) => {
    const response = await authService.login(email, password)
    setToken(response.token)
    setUser(response.user)
    localStorage.setItem('token', response.token)
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    authService.logout()
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, token }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}


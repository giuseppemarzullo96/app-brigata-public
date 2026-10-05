import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
// I caratteri stanno sul nostro server, come le statistiche: da Google Fonts
// ogni apertura dell'app passerebbe a Google l'indirizzo IP del socio.
// Solo il sottoinsieme latino, che copre anche le lettere accentate.
import '@fontsource/source-sans-3/latin-400.css'
import '@fontsource/source-sans-3/latin-600.css'
import '@fontsource/source-sans-3/latin-700.css'
import '@fontsource/archivo/latin-500.css'
import '@fontsource/archivo/latin-600.css'
import '@fontsource/archivo/latin-700.css'
import './index.css'
import { inizializzaMonitoraggio } from './services/monitoraggio'

// Prima di montare l'app, cosi' cattura anche gli errori di avvio.
inizializzaMonitoraggio()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          {/* Senza questo i messaggi toast.success/toast.error delle pagine
              non compaiono: conferme ed errori restavano invisibili. */}
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3500,
              style: { fontFamily: '"Source Sans 3", system-ui, sans-serif', fontSize: '16px', color: '#232321', borderRadius: '12px' },
              success: { iconTheme: { primary: '#2F6B43', secondary: '#fff' } },
              error: { duration: 5000, iconTheme: { primary: '#9E3226', secondary: '#fff' } },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)


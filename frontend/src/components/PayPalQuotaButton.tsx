import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/authService'
import toast from 'react-hot-toast'

interface PayPalQuotaButtonProps {
  userId: string
  quotaId: string
  onPagamentoCompletato: () => void
}

declare global {
  interface Window {
    paypal?: any
  }
}

/**
 * Carica l'SDK PayPal una sola volta per sessione, usando il client id
 * fornito dal backend (così cambiare credenziali non richiede una nuova build).
 */
function caricaSdkPayPal(clientId: string): Promise<void> {
  if (window.paypal) return Promise.resolve()

  const esistente = document.querySelector<HTMLScriptElement>('script[data-paypal-sdk]')
  if (esistente) {
    return new Promise((resolve, reject) => {
      esistente.addEventListener('load', () => resolve())
      esistente.addEventListener('error', () => reject(new Error('SDK PayPal non caricato')))
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=EUR&intent=capture`
    script.dataset.paypalSdk = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('SDK PayPal non caricato'))
    document.body.appendChild(script)
  })
}

const PayPalQuotaButton = ({ userId, quotaId, onPagamentoCompletato }: PayPalQuotaButtonProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)

  const { data: config, isLoading } = useQuery({
    queryKey: ['paypal', 'config'],
    queryFn: async () => {
      const response = await api.get('/users/paypal/config')
      return response.data
    },
  })

  useEffect(() => {
    if (!config?.configurato || !config?.clientId || !containerRef.current) return

    let annullato = false

    caricaSdkPayPal(config.clientId)
      .then(() => {
        if (annullato || !containerRef.current || !window.paypal) return
        containerRef.current.innerHTML = ''

        window.paypal
          .Buttons({
            createOrder: async () => {
              const response = await api.post(`/users/${userId}/quote/${quotaId}/paypal/create`)
              return response.data.orderId
            },
            onApprove: async (data: any) => {
              await api.post(`/users/${userId}/quote/${quotaId}/paypal/capture`, {
                orderId: data.orderID,
              })
              toast.success('Pagamento completato!')
              onPagamentoCompletato()
            },
            onError: (err: any) => {
              console.error('Errore PayPal:', err)
              setErrore('Si è verificato un errore durante il pagamento. Riprova.')
            },
          })
          .render(containerRef.current)
          .then(() => {
            if (!annullato) setPronto(true)
          })
      })
      .catch((err) => {
        console.error(err)
        setErrore('Impossibile caricare PayPal. Controlla la connessione.')
      })

    return () => {
      annullato = true
    }
  }, [config, userId, quotaId, onPagamentoCompletato])

  if (isLoading) {
    return <p className="text-sm text-gray-500">Caricamento…</p>
  }

  if (!config?.configurato) {
    return (
      <p className="text-sm text-gray-600">
        I pagamenti PayPal non sono ancora attivi. Usa "Segnala pagamento" dopo aver pagato
        con un altro metodo.
      </p>
    )
  }

  return (
    <div>
      {config.ambiente === 'sandbox' && (
        <p className="mb-3 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">
          Modalità test (sandbox): nessun pagamento reale verrà addebitato.
        </p>
      )}
      <div ref={containerRef} />
      {!pronto && !errore && <p className="text-sm text-gray-500">Caricamento PayPal…</p>}
      {errore && <p className="text-sm text-red-600">{errore}</p>}
    </div>
  )
}

export default PayPalQuotaButton

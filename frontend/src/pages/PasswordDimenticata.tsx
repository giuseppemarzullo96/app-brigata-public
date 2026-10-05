import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../services/authService'
import { CorniceAccesso } from './ReimpostaPassword'

/**
 * Chi ha dimenticato la password scrive la sua email e riceve, per email e
 * WhatsApp, un link per sceglierne una nuova. La risposta e' la stessa che
 * l'email sia registrata o no.
 */
export default function PasswordDimenticata() {
  const location = useLocation()
  const [email, setEmail] = useState<string>((location.state as any)?.email || '')
  const [attesa, setAttesa] = useState(false)
  const [inviata, setInviata] = useState(false)

  const invia = async (e: React.FormEvent) => {
    e.preventDefault()
    if (attesa) return
    setAttesa(true)
    try {
      await api.post('/auth/password-dimenticata', { email })
      setInviata(true)
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Invio non riuscito. Riprova fra poco.')
    } finally {
      setAttesa(false)
    }
  }

  if (inviata) {
    return (
      <CorniceAccesso sottotitolo="Password dimenticata">
        <div className="text-center">
          <MailCheck className="mx-auto h-10 w-10 text-primary-600" />
          <p className="mt-3 font-semibold text-gray-900">Controlla email e WhatsApp</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            Se <strong>{email}</strong> è registrata, ti abbiamo mandato un link per scegliere una nuova password.
            Vale 30 minuti. Se non arriva, controlla lo spam o chiedi a un amministratore.
          </p>
          <Link to="/login" className="mt-5 inline-block text-sm text-primary-600 hover:text-primary-700">
            Torna all'accesso
          </Link>
        </div>
      </CorniceAccesso>
    )
  }

  return (
    <CorniceAccesso sottotitolo="Password dimenticata">
      <form onSubmit={invia} className="space-y-4">
        <p className="text-sm leading-relaxed text-gray-600">
          Scrivi l'email con cui accedi: ti mandiamo un link per sceglierne una nuova.
        </p>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="input mt-1.5 min-h-[48px]"
            placeholder="nome@example.com"
          />
        </div>
        <button
          type="submit"
          disabled={attesa}
          className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-gray-900 text-base font-bold text-white transition hover:bg-gray-800 disabled:opacity-60"
        >
          {attesa ? 'Invio…' : 'Mandami il link'}
        </button>
        <Link to="/login" className="block text-center text-sm text-primary-600 hover:text-primary-700">
          Torna all'accesso
        </Link>
      </form>
    </CorniceAccesso>
  )
}

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../services/authService'

/**
 * Si apre dal link arrivato per email o WhatsApp. Il gettone sta dopo il #
 * dell'indirizzo: il browser non lo manda al server con la pagina, quindi
 * non finisce nei log.
 */
export default function ReimpostaPassword() {
  const navigate = useNavigate()
  const [token] = useState(() => window.location.hash.slice(1))
  const [password, setPassword] = useState('')
  const [conferma, setConferma] = useState('')
  const [attesa, setAttesa] = useState(false)

  const salva = async (e: React.FormEvent) => {
    e.preventDefault()
    if (attesa) return
    if (password.length < 8) return toast.error('La password deve essere di almeno 8 caratteri')
    if (password !== conferma) return toast.error('Le due password non coincidono')
    setAttesa(true)
    try {
      await api.post('/auth/reimposta-password', { token, password })
      toast.success('Password aggiornata. Ora puoi accedere.')
      navigate('/login', { replace: true })
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Non è stato possibile aggiornare la password', { duration: 8000 })
    } finally {
      setAttesa(false)
    }
  }

  if (!token) {
    return (
      <CorniceAccesso sottotitolo="Nuova password">
        <p className="text-sm leading-relaxed text-gray-600">
          Questo link è incompleto. Aprilo di nuovo dal messaggio ricevuto, oppure chiedine uno nuovo.
        </p>
        <Link to="/password-dimenticata" className="mt-4 inline-block text-sm text-primary-600 hover:text-primary-700">
          Chiedi un nuovo link
        </Link>
      </CorniceAccesso>
    )
  }

  return (
    <CorniceAccesso sottotitolo="Scegli una nuova password">
      <form onSubmit={salva} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Nuova password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="input mt-1.5 min-h-[48px]"
          />
          <p className="mt-1 text-xs text-gray-500">Almeno 8 caratteri.</p>
        </div>
        <div>
          <label htmlFor="conferma" className="block text-sm font-medium text-gray-700">
            Ripeti la password
          </label>
          <input
            id="conferma"
            type="password"
            autoComplete="new-password"
            value={conferma}
            onChange={(e) => setConferma(e.target.value)}
            required
            className="input mt-1.5 min-h-[48px]"
          />
        </div>
        <button
          type="submit"
          disabled={attesa}
          className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-gray-900 text-base font-bold text-white transition hover:bg-gray-800 disabled:opacity-60"
        >
          {attesa ? 'Salvataggio…' : 'Salva la nuova password'}
        </button>
        <Link to="/password-dimenticata" className="block text-center text-sm text-primary-600 hover:text-primary-700">
          Il link è scaduto? Chiedine uno nuovo
        </Link>
      </form>
    </CorniceAccesso>
  )
}

/** La stessa cornice della pagina di accesso. */
export function CorniceAccesso({ sottotitolo, children }: { sottotitolo: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-5">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <img src="/logo-labrigata.png" alt="" className="mx-auto h-16 w-16" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-gray-900">La Brigata</h1>
          <p className="mt-1 text-sm text-gray-500">{sottotitolo}</p>
        </div>
        <div className="mt-8 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  )
}

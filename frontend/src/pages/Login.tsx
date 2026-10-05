import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const Login = () => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const destinazione = (location.state as any)?.from
  const percorsoDestinazione = destinazione
    ? `${destinazione.pathname}${destinazione.search || ''}`
    : '/dashboard'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)

    try {
      await login(email, password)
      toast.success('Accesso effettuato')
      navigate(percorsoDestinazione, { replace: true })
    } catch (error: any) {
      if (error.response?.status === 429) {
        toast.error('Troppi tentativi. Attendi qualche secondo.')
      } else if (error.response?.status === 403 && error.response?.data?.sospeso) {
        toast.error(
          error.response?.data?.error ||
            'Il tuo stato di socio è sospeso o revocato. Scrivi a labrigatasalerno@gmail.com.',
          { duration: 10000 }
        )
      } else {
        toast.error(error.response?.data?.error || 'Email o password non corretti')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-5">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <img src="/logo-labrigata.png" alt="" className="mx-auto h-16 w-16" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-gray-900">La Brigata</h1>
          <p className="mt-1 text-sm text-gray-500">Turni, votazioni e comunicazioni dei soci.</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
        >
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
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <Link
                to="/password-dimenticata"
                state={{ email }}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                Password dimenticata?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input mt-1.5 min-h-[48px]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-gray-900 text-base font-bold text-white transition hover:bg-gray-800 disabled:opacity-60"
          >
            {loading ? 'Accesso…' : 'Entra'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login

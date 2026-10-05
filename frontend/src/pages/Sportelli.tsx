import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../services/authService'
import { Building2, Plus, Calendar, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const Sportelli = () => {
  const { user } = useAuth()
  const isAdmin = user?.ruolo === 'admin'
  const canAccess = isAdmin || user?.ruolo === 'socio_volontario'

  const { data, isLoading } = useQuery({
    queryKey: ['sportelli'],
    queryFn: async () => {
      const response = await api.get('/sportelli')
      return response.data
    },
    enabled: canAccess,
  })

  if (!canAccess) {
    return (
      <div className="card text-center py-12">
        <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">Accesso riservato agli operatori</p>
      </div>
    )
  }

  if (isLoading) {
    return <div>Caricamento sportelli...</div>
  }

  const sportelli = data?.sportelli || []

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Sportelli Specialistici</h1>
        {isAdmin && (
          <Link to="/sportelli/nuovo" className="btn btn-primary flex items-center">
            <Plus className="w-4 h-4 mr-2" />
            Nuovo Sportello
          </Link>
        )}
      </div>

      {sportelli.length === 0 ? (
        <div className="card text-center py-12">
          <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Nessuno sportello configurato</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sportelli.map((sportello: any) => (
            <Link
              key={sportello.id}
              to={`/sportelli/${sportello.id}`}
              className="card hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{sportello.nome}</h3>
                  {sportello.descrizione && (
                    <p className="text-sm text-gray-600 mb-2">{sportello.descrizione}</p>
                  )}
                  {sportello.responsabile_nome && (
                    <p className="text-xs text-gray-500">
                      Responsabile: {sportello.responsabile_nome} {sportello.responsabile_cognome}
                    </p>
                  )}
                </div>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    sportello.attivo
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {sportello.attivo ? 'Attivo' : 'Inattivo'}
                </span>
              </div>
              <div className="flex gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Appuntamenti</span>
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span>Beneficiari</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default Sportelli

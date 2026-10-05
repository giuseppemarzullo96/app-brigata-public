import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../services/authService'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Bell, AlertCircle, Info, AlertTriangle, Trash2, ArrowLeft, CheckCircle, Users, Calendar, MessageSquare } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const AvvisoDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.ruolo === 'admin'

  const { data, isLoading } = useQuery({
    queryKey: ['avviso', id],
    queryFn: async () => {
      const response = await api.get(`/avvisi/${id}`)
      return response.data
    },
    enabled: !!id,
  })

  const { data: lettureData } = useQuery({
    queryKey: ['avviso-letture', id],
    queryFn: async () => {
      const response = await api.get(`/avvisi/${id}/letture`)
      return response.data
    },
    enabled: !!id && isAdmin,
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/avvisi/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avvisi'] })
      queryClient.invalidateQueries({ queryKey: ['avvisi', 'non-letti-count'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Avviso eliminato con successo')
      navigate('/avvisi')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'eliminazione')
    },
  })

  const segnaLettoMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/avvisi/${id}/segna-letto`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avviso', id] })
      queryClient.invalidateQueries({ queryKey: ['avvisi'] })
      queryClient.invalidateQueries({ queryKey: ['avvisi', 'non-letti-count'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  if (isLoading) {
    return <div>Caricamento...</div>
  }

  const avviso = data?.avviso
  if (!avviso) {
    return <div>Avviso non trovato</div>
  }

  const getPrioritaIcon = (priorita: string) => {
    switch (priorita) {
      case 'urgente':
        return <AlertCircle className="w-6 h-6 text-red-600" />
      case 'alta':
        return <AlertTriangle className="w-6 h-6 text-orange-600" />
      case 'normale':
        return <Info className="w-6 h-6 text-blue-600" />
      default:
        return <Bell className="w-6 h-6 text-gray-600" />
    }
  }

  const getPrioritaColor = (priorita: string) => {
    switch (priorita) {
      case 'urgente':
        return 'border-red-500 bg-red-50'
      case 'alta':
        return 'border-orange-500 bg-orange-50'
      case 'normale':
        return 'border-blue-500 bg-blue-50'
      default:
        return 'border-gray-300 bg-white'
    }
  }

  const letture = lettureData?.letture || []

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <Link to="/avvisi" className="btn btn-secondary flex items-center">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Torna agli Avvisi
        </Link>
        {isAdmin && (
          <button
            onClick={() => {
              if (confirm('Sei sicuro di voler eliminare questo avviso?')) {
                deleteMutation.mutate()
              }
            }}
            className="btn btn-danger flex items-center"
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Elimina
          </button>
        )}
      </div>

      <div className={`card border-l-4 ${getPrioritaColor(avviso.priorita || 'normale')}`}>
        <div className="flex items-start gap-4 mb-6">
          <div className="mt-1">{getPrioritaIcon(avviso.priorita || 'normale')}</div>
          <div className="flex-1">
            <div className="flex justify-between items-start mb-4">
              <h1 className="text-2xl font-bold text-gray-900">{avviso.titolo}</h1>
              {avviso.letto && (
                <span className="flex items-center text-sm text-green-600">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  Letto
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500 mb-4">
              <p>
                Creato da: {avviso.creatore_nome} {avviso.creatore_cognome}
              </p>
              <p>
                Data: {format(new Date(avviso.created_at), 'd MMMM yyyy HH:mm', { locale: it })}
              </p>
              {avviso.data_scadenza && (
                <p>
                  Scade il: {format(new Date(avviso.data_scadenza), 'd MMMM yyyy', { locale: it })}
                </p>
              )}
              {isAdmin && avviso.numero_letture !== undefined && (
                <p className="mt-2 font-medium">
                  <Users className="w-4 h-4 inline mr-1" />
                  Letto da {avviso.numero_letture} {avviso.numero_letture === 1 ? 'persona' : 'persone'}
                </p>
              )}
            </div>
            <div className="prose max-w-none">
              <p className="text-gray-700 whitespace-pre-line">{avviso.contenuto}</p>
            </div>
            
            {/* Link diretti ad assemblee e sondaggi */}
            {(avviso.assemblea_id || avviso.sondaggio_id) && (
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-semibold mb-3 text-gray-900">Azioni rapide</h3>
                <div className="flex gap-3">
                  {avviso.assemblea_id && (
                    <Link
                      to={`/assemblee/${avviso.assemblea_id}`}
                      className="btn btn-primary flex items-center"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      Vai all'Assemblea
                    </Link>
                  )}
                  {avviso.sondaggio_id && (
                    <Link
                      to={`/sondaggi/${avviso.sondaggio_id}`}
                      className="btn btn-primary flex items-center"
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Vai al Sondaggio
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {!avviso.letto && avviso.pubblicato && (
          <div className="mt-4 pt-4 border-t">
            <button
              onClick={() => segnaLettoMutation.mutate()}
              className="btn btn-primary flex items-center"
              disabled={segnaLettoMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Segna come letto
            </button>
          </div>
        )}
      </div>

      {isAdmin && letture.length > 0 && (
        <div className="card mt-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Users className="w-5 h-5 mr-2" />
            Utenti che hanno letto l'avviso ({letture.length})
          </h2>
          <div className="space-y-2">
            {letture.map((lettura: any) => (
              <div key={lettura.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <div>
                  <p className="font-medium">
                    {lettura.nome} {lettura.cognome}
                  </p>
                  <p className="text-sm text-gray-500">{lettura.email}</p>
                  <p className="text-xs text-gray-400 capitalize">{lettura.categoria_socio}</p>
                </div>
                <p className="text-sm text-gray-500">
                  {format(new Date(lettura.data_lettura), 'd MMM yyyy HH:mm', { locale: it })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AvvisoDetail


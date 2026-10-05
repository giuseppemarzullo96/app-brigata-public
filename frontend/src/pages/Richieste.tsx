import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/authService'
import { FileText, CheckCircle, Clock, Archive, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import Modal from '../components/Modal'
import { FormSelect, FormTextarea } from '../components/FormInput'
import { useState } from 'react'

const Richieste = () => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [selectedRichiesta, setSelectedRichiesta] = useState<any>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['richieste'],
    queryFn: async () => {
      const response = await api.get('/richieste')
      return response.data
    },
  })

  const { data: usersData } = useQuery({
    queryKey: ['users', 'list'],
    queryFn: async () => {
      const response = await api.get('/users', { params: { fittizio: 'false' } })
      return response.data
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await api.put(`/richieste/${id}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['richieste'] })
      toast.success('Richiesta aggiornata!')
      setIsModalOpen(false)
      setSelectedRichiesta(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'aggiornamento')
    },
  })

  if (user?.ruolo !== 'admin') {
    return (
      <div className="card text-center py-12">
        <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-500">Accesso riservato agli amministratori</p>
      </div>
    )
  }

  const richieste = data?.richieste || []
  const users = usersData?.users || []

  const getStatoBadge = (stato: string) => {
    const badges = {
      nuova: 'bg-blue-100 text-blue-800',
      in_lavorazione: 'bg-yellow-100 text-yellow-800',
      completata: 'bg-green-100 text-green-800',
      archiviata: 'bg-gray-100 text-gray-800',
    }
    return badges[stato as keyof typeof badges] || badges.nuova
  }

  const getStatoIcon = (stato: string) => {
    switch (stato) {
      case 'completata':
        return <CheckCircle className="w-4 h-4" />
      case 'in_lavorazione':
        return <Clock className="w-4 h-4" />
      case 'archiviata':
        return <Archive className="w-4 h-4" />
      default:
        return <FileText className="w-4 h-4" />
    }
  }

  const handleUpdate = (richiesta: any) => {
    setSelectedRichiesta(richiesta)
    setIsModalOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRichiesta) return

    const formData = new FormData(e.target as HTMLFormElement)
    updateMutation.mutate({
      id: selectedRichiesta.id,
      data: {
        stato: formData.get('stato'),
        assegnata_a: formData.get('assegnata_a') || null,
        note_internal: formData.get('note_internal') || null,
      },
    })
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Richieste dal Sito Web</h1>

      {isLoading ? (
        <div>Caricamento richieste...</div>
      ) : richieste.length === 0 ? (
        <div className="card text-center py-12">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Nessuna richiesta presente</p>
        </div>
      ) : (
        <div className="space-y-4">
          {richieste.map((richiesta: any) => (
            <div key={richiesta.id} className="card">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-3 py-1 rounded text-sm font-medium flex items-center gap-1 ${getStatoBadge(richiesta.stato)}`}>
                      {getStatoIcon(richiesta.stato)}
                      {richiesta.stato.replace('_', ' ')}
                    </span>
                    <span className="text-sm text-gray-600 capitalize">
                      {richiesta.tipo_richiesta}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    {richiesta.nome}
                    {richiesta.email && (
                      <span className="text-sm font-normal text-gray-600 ml-2">
                        ({richiesta.email})
                      </span>
                    )}
                  </h3>
                  {richiesta.telefono && (
                    <p className="text-sm text-gray-600 mb-2">Tel: {richiesta.telefono}</p>
                  )}
                  <p className="text-gray-700 whitespace-pre-line mb-2">{richiesta.messaggio}</p>
                  {richiesta.assegnato_nome && (
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                      <User className="w-4 h-4" />
                      Assegnata a: {richiesta.assegnato_nome} {richiesta.assegnato_cognome}
                    </p>
                  )}
                  {richiesta.note_internal && (
                    <div className="mt-2 p-2 bg-yellow-50 rounded text-sm">
                      <strong>Note interne:</strong> {richiesta.note_internal}
                    </div>
                  )}
                </div>
                <div className="text-right ml-4">
                  <p className="text-xs text-gray-500 mb-2">
                    {format(new Date(richiesta.created_at), 'd MMM yyyy, HH:mm', { locale: it })}
                  </p>
                  <button
                    onClick={() => handleUpdate(richiesta)}
                    className="btn btn-primary text-sm"
                  >
                    Gestisci
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Gestione */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setSelectedRichiesta(null)
        }}
        title="Gestisci Richiesta"
        size="md"
      >
        {selectedRichiesta && (
          <form onSubmit={handleSubmit}>
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <p className="text-sm">
                <strong>Da:</strong> {selectedRichiesta.nome} ({selectedRichiesta.email})
              </p>
              <p className="text-sm mt-1">
                <strong>Messaggio:</strong> {selectedRichiesta.messaggio}
              </p>
            </div>

            <FormSelect
              label="Stato"
              id="stato"
              name="stato"
              defaultValue={selectedRichiesta.stato}
              options={[
                { value: 'nuova', label: 'Nuova' },
                { value: 'in_lavorazione', label: 'In Lavorazione' },
                { value: 'completata', label: 'Completata' },
                { value: 'archiviata', label: 'Archiviata' },
              ]}
            />

            <FormSelect
              label="Assegna a"
              id="assegnata_a"
              name="assegnata_a"
              defaultValue={selectedRichiesta.assegnata_a || ''}
              options={[
                { value: '', label: 'Nessuno' },
                ...users
                  .filter((u) => u.attivo)
                  .map((u) => ({
                    value: u.id,
                    label: `${u.nome} ${u.cognome}`,
                  })),
              ]}
            />

            <FormTextarea
              label="Note Interne"
              id="note_internal"
              name="note_internal"
              defaultValue={selectedRichiesta.note_internal || ''}
              rows={4}
            />

            <div className="flex gap-4 mt-6">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Salvataggio...' : 'Salva'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false)
                  setSelectedRichiesta(null)
                }}
                className="btn btn-secondary"
              >
                Annulla
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

export default Richieste


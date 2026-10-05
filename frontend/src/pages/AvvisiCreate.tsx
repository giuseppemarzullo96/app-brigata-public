import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/authService'
import { FormInput, FormTextarea, FormSelect } from '../components/FormInput'
import toast from 'react-hot-toast'

const AvvisiCreate = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    titolo: '',
    contenuto: '',
    priorita: 'normale',
    destinatari: [] as string[],
    data_scadenza: '',
  })

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/avvisi', {
        ...data,
        destinatari: data.destinatari.length > 0 ? data.destinatari : null,
        data_scadenza: data.data_scadenza || null,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avvisi'] })
      queryClient.invalidateQueries({ queryKey: ['avvisi', 'non-letti-count'] })
      toast.success('Avviso creato con successo!')
      navigate('/avvisi')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la creazione dell\'avviso')
    },
  })

  const pubblicaMutation = useMutation({
    mutationFn: async (avvisoId: string) => {
      await api.post(`/avvisi/${avvisoId}/pubblica`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['avvisi'] })
      queryClient.invalidateQueries({ queryKey: ['avvisi', 'non-letti-count'] })
      toast.success('Avviso pubblicato!')
      navigate('/avvisi')
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await createMutation.mutateAsync(formData)
    if (confirm('Vuoi pubblicare subito l\'avviso?')) {
      pubblicaMutation.mutate(result.avviso.id)
    }
  }

  const toggleDestinatario = (categoria: string) => {
    if (formData.destinatari.includes(categoria)) {
      setFormData({
        ...formData,
        destinatari: formData.destinatari.filter((d) => d !== categoria),
      })
    } else {
      setFormData({
        ...formData,
        destinatari: [...formData.destinatari, categoria],
      })
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Nuovo Avviso</h1>
      <div className="card max-w-3xl">
        <form onSubmit={handleSubmit}>
          <FormInput
            label="Titolo"
            id="titolo"
            value={formData.titolo}
            onChange={(e) => setFormData({ ...formData, titolo: e.target.value })}
            required
          />

          <FormTextarea
            label="Contenuto"
            id="contenuto"
            value={formData.contenuto}
            onChange={(e) => setFormData({ ...formData, contenuto: e.target.value })}
            rows={6}
            required
          />

          <FormSelect
            label="Priorità"
            id="priorita"
            value={formData.priorita}
            onChange={(e) => setFormData({ ...formData, priorita: e.target.value })}
            options={[
              { value: 'bassa', label: 'Bassa' },
              { value: 'normale', label: 'Normale' },
              { value: 'alta', label: 'Alta' },
              { value: 'urgente', label: 'Urgente' },
            ]}
          />

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Destinatari (lascia vuoto per tutti)
            </label>
            <div className="space-y-2">
              {['volontario', 'ordinario', 'simpatizzante', 'esterno'].map((cat) => (
                <label key={cat} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.destinatari.includes(cat)}
                    onChange={() => toggleDestinatario(cat)}
                    className="mr-2"
                  />
                  <span className="text-sm capitalize">{cat}</span>
                </label>
              ))}
            </div>
          </div>

          <FormInput
            label="Data Scadenza (opzionale)"
            type="date"
            id="data_scadenza"
            value={formData.data_scadenza}
            onChange={(e) => setFormData({ ...formData, data_scadenza: e.target.value })}
          />

          <div className="flex gap-4 mt-6">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creazione...' : 'Crea Avviso'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/avvisi')}
              className="btn btn-secondary"
            >
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AvvisiCreate


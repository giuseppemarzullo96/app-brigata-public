import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/authService'
import { FormInput, FormTextarea, FormSelect } from '../components/FormInput'
import toast from 'react-hot-toast'

const AssembleeCreate = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    titolo: '',
    data_assemblea: '',
    ora_assemblea: '',
    luogo: '',
    ordine_del_giorno: '',
    tipo_assemblea: 'ordinaria',
  })

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      // Combina data e ora
      const dataCompleta = `${data.data_assemblea}T${data.ora_assemblea}:00`
      const response = await api.post('/assemblee', {
        ...data,
        data_assemblea: dataCompleta,
      })
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['assemblee'] })
      toast.success('Assemblea creata con successo!')
      navigate(`/assemblee/${data.assemblea.id}`)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la creazione dell\'assemblea')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(formData)
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Nuova Assemblea</h1>
      <div className="card max-w-3xl">
        <form onSubmit={handleSubmit}>
          <FormInput
            label="Titolo"
            id="titolo"
            value={formData.titolo}
            onChange={(e) => setFormData({ ...formData, titolo: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormInput
              label="Data"
              type="date"
              id="data_assemblea"
              value={formData.data_assemblea}
              onChange={(e) => setFormData({ ...formData, data_assemblea: e.target.value })}
              required
            />

            <FormInput
              label="Ora"
              type="time"
              id="ora_assemblea"
              value={formData.ora_assemblea}
              onChange={(e) => setFormData({ ...formData, ora_assemblea: e.target.value })}
              required
            />
          </div>

          <FormInput
            label="Luogo"
            id="luogo"
            value={formData.luogo}
            onChange={(e) => setFormData({ ...formData, luogo: e.target.value })}
          />

          <FormSelect
            label="Tipo Assemblea"
            id="tipo_assemblea"
            value={formData.tipo_assemblea}
            onChange={(e) => setFormData({ ...formData, tipo_assemblea: e.target.value })}
            options={[
              { value: 'ordinaria', label: 'Ordinaria' },
              { value: 'straordinaria', label: 'Straordinaria' },
              { value: 'consiglio', label: 'Consiglio' },
            ]}
          />

          <FormTextarea
            label="Ordine del Giorno"
            id="ordine_del_giorno"
            value={formData.ordine_del_giorno}
            onChange={(e) => setFormData({ ...formData, ordine_del_giorno: e.target.value })}
            rows={8}
            placeholder="1. Prima voce&#10;2. Seconda voce&#10;..."
          />

          <div className="flex gap-4 mt-6">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creazione...' : 'Crea Assemblea'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/assemblee')}
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

export default AssembleeCreate


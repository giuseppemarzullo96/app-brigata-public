import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/authService'
import { FormInput, FormTextarea, FormSelect } from '../components/FormInput'
import toast from 'react-hot-toast'

const TurniCreate = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    data_turno: '',
    tipo_turno: 'cena',
    numero_porzioni: '',
    note_generali: '',
  })

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/turni', data)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['turni'] })
      toast.success('Turno creato con successo!')
      navigate(`/turni/${data.turno.id}`)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la creazione del turno')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      ...formData,
      numero_porzioni: formData.numero_porzioni ? parseInt(formData.numero_porzioni) : null,
    })
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Nuovo Turno</h1>
      <div className="card max-w-2xl">
        <form onSubmit={handleSubmit}>
          <FormInput
            label="Data Turno"
            type="date"
            id="data_turno"
            value={formData.data_turno}
            onChange={(e) => setFormData({ ...formData, data_turno: e.target.value })}
            required
          />

          <FormSelect
            label="Tipo Turno"
            id="tipo_turno"
            value={formData.tipo_turno}
            onChange={(e) => setFormData({ ...formData, tipo_turno: e.target.value })}
            options={[
              { value: 'colazione', label: 'Colazione' },
              { value: 'pranzo', label: 'Pranzo' },
              { value: 'cena', label: 'Cena' },
            ]}
            required
          />

          <FormInput
            label="Numero Porzioni"
            type="number"
            id="numero_porzioni"
            value={formData.numero_porzioni}
            onChange={(e) => setFormData({ ...formData, numero_porzioni: e.target.value })}
            min="1"
          />

          <FormTextarea
            label="Note Generali"
            id="note_generali"
            value={formData.note_generali}
            onChange={(e) => setFormData({ ...formData, note_generali: e.target.value })}
            rows={4}
          />

          <div className="flex gap-4 mt-6">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creazione...' : 'Crea Turno'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/turni')}
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

export default TurniCreate


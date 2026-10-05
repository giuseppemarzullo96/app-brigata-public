import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/authService'
import { FormInput, FormTextarea, FormSelect } from '../components/FormInput'
import toast from 'react-hot-toast'

const MagazzinoCreate = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    categoria_id: '',
    nome: '',
    descrizione: '',
    quantita_disponibile: '',
    quantita_minima: '',
    unita_misura: '',
    ubicazione: '',
    note: '',
  })

  const { data: categorieData } = useQuery({
    queryKey: ['magazzino', 'categorie'],
    queryFn: async () => {
      const response = await api.get('/magazzino/categorie')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/magazzino/beni', {
        ...data,
        quantita_disponibile: data.quantita_disponibile ? parseFloat(data.quantita_disponibile) : 0,
        quantita_minima: data.quantita_minima ? parseFloat(data.quantita_minima) : 0,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['magazzino'] })
      toast.success('Bene creato con successo!')
      navigate('/magazzino')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la creazione')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(formData)
  }

  const categorie = categorieData?.categorie || []

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Nuovo Bene</h1>
      <div className="card max-w-3xl">
        <form onSubmit={handleSubmit}>
          <FormSelect
            label="Categoria"
            id="categoria_id"
            value={formData.categoria_id}
            onChange={(e) => setFormData({ ...formData, categoria_id: e.target.value })}
            options={categorie.map((cat: any) => ({
              value: cat.id,
              label: cat.nome,
            }))}
            placeholder="Seleziona categoria"
            required
          />

          <FormInput
            label="Nome"
            id="nome"
            value={formData.nome}
            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            required
          />

          <FormTextarea
            label="Descrizione"
            id="descrizione"
            value={formData.descrizione}
            onChange={(e) => setFormData({ ...formData, descrizione: e.target.value })}
            rows={3}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormInput
              label="Quantità Disponibile"
              type="number"
              id="quantita_disponibile"
              value={formData.quantita_disponibile}
              onChange={(e) => setFormData({ ...formData, quantita_disponibile: e.target.value })}
              min="0"
              step="0.01"
            />

            <FormInput
              label="Quantità Minima (Alert)"
              type="number"
              id="quantita_minima"
              value={formData.quantita_minima}
              onChange={(e) => setFormData({ ...formData, quantita_minima: e.target.value })}
              min="0"
              step="0.01"
            />

            <FormInput
              label="Unità di Misura"
              id="unita_misura"
              value={formData.unita_misura}
              onChange={(e) => setFormData({ ...formData, unita_misura: e.target.value })}
              placeholder="es: pezzi, kg, litri"
            />
          </div>

          <FormInput
            label="Ubicazione"
            id="ubicazione"
            value={formData.ubicazione}
            onChange={(e) => setFormData({ ...formData, ubicazione: e.target.value })}
            placeholder="Dove è conservato"
          />

          <FormTextarea
            label="Note"
            id="note"
            value={formData.note}
            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
            rows={3}
          />

          <div className="flex gap-4 mt-6">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creazione...' : 'Crea Bene'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/magazzino')}
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

export default MagazzinoCreate


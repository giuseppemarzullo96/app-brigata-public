import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/authService'
import { FormInput, FormTextarea, FormSelect } from '../components/FormInput'
import { Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'

const SondaggiCreate = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    titolo: '',
    descrizione: '',
    tipo_sondaggio: 'scelta_multipla',
    destinatari: [] as string[],
    risultati_visibili: false,
    permetti_multiple_risposte: false,
  })
  const [opzioni, setOpzioni] = useState<string[]>(['', ''])

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/sondaggi', {
        ...data,
        opzioni: opzioni.filter((o) => o.trim() !== '').map((testo) => ({ testo })),
      })
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sondaggi'] })
      toast.success('Sondaggio creato con successo!')
      navigate(`/sondaggi/${data.sondaggio.id}`)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la creazione del sondaggio')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.tipo_sondaggio === 'scelta_multipla' && opzioni.filter((o) => o.trim()).length < 2) {
      toast.error('Aggiungi almeno 2 opzioni di risposta')
      return
    }
    createMutation.mutate(formData)
  }

  const addOpzione = () => {
    setOpzioni([...opzioni, ''])
  }

  const removeOpzione = (index: number) => {
    setOpzioni(opzioni.filter((_, i) => i !== index))
  }

  const updateOpzione = (index: number, value: string) => {
    const newOpzioni = [...opzioni]
    newOpzioni[index] = value
    setOpzioni(newOpzioni)
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
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Nuovo Sondaggio</h1>
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
            label="Descrizione"
            id="descrizione"
            value={formData.descrizione}
            onChange={(e) => setFormData({ ...formData, descrizione: e.target.value })}
            rows={4}
          />

          <FormSelect
            label="Tipo Sondaggio"
            id="tipo_sondaggio"
            value={formData.tipo_sondaggio}
            onChange={(e) => setFormData({ ...formData, tipo_sondaggio: e.target.value })}
            options={[
              { value: 'scelta_multipla', label: 'Scelta Multipla' },
              { value: 'testo_libero', label: 'Testo Libero' },
              { value: 'si_no', label: 'Sì/No' },
            ]}
          />

          {formData.tipo_sondaggio === 'scelta_multipla' && (
            <div className="mb-4">
              <div className="mb-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.permetti_multiple_risposte}
                    onChange={(e) =>
                      setFormData({ ...formData, permetti_multiple_risposte: e.target.checked })
                    }
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">
                    Permetti più risposte (l'utente può selezionare più opzioni)
                  </span>
                </label>
              </div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Opzioni di Risposta <span className="text-red-500">*</span>
              </label>
              {opzioni.map((opzione, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={opzione}
                    onChange={(e) => updateOpzione(index, e.target.value)}
                    placeholder={`Opzione ${index + 1}`}
                    className="input flex-1"
                  />
                  {opzioni.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOpzione(index)}
                      aria-label="Togli questa opzione"
                      className="btn btn-secondary px-3"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addOpzione}
                className="btn btn-secondary text-sm flex items-center mt-2"
              >
                <Plus className="w-4 h-4 mr-1" />
                Aggiungi Opzione
              </button>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Destinatari
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

          <div className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.risultati_visibili}
                onChange={(e) =>
                  setFormData({ ...formData, risultati_visibili: e.target.checked })
                }
                className="mr-2"
              />
              <span className="text-sm">Risultati visibili ai soci</span>
            </label>
          </div>

          <div className="flex gap-4 mt-6">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creazione...' : 'Crea Sondaggio'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/sondaggi')}
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

export default SondaggiCreate


import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/authService'
import { FormInput, FormTextarea, FormSelect } from '../components/FormInput'
import toast from 'react-hot-toast'
import { Nota } from '../components/ui'
import { esitoInvioCredenziali } from '../services/credenziali'

const SociCreate = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    email: '',
    nome: '',
    cognome: '',
    telefono: '',
    categoria_socio: 'ordinario',
    ruolo: 'socio_ordinario',
    tipo_persona: 'fisica',
    ragione_sociale: '',
    partita_iva: '',
    indirizzo: '',
    citta: '',
    cap: '',
  })

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post('/auth/register', data)
      return response.data
    },
    onSuccess: (dati) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Socio creato con successo!')
      const esito = esitoInvioCredenziali(dati?.credenziali)
      if (esito) (esito.ok ? toast.success : toast.error)(esito.testo, { duration: 6000 })
      navigate('/soci')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la creazione del socio')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(formData)
  }

  const categoriaOptions = [
    { value: 'volontario', label: 'Volontario' },
    { value: 'ordinario', label: 'Ordinario' },
    { value: 'simpatizzante', label: 'Simpatizzante' },
    { value: 'esterno', label: 'Esterno' },
    { value: 'giuridico', label: 'Giuridico' },
  ]

  const ruoloOptions = [
    { value: 'admin', label: 'Admin' },
    // Organizza turni e ricettario come un admin, ma non vede libro soci,
    // quote e impostazioni.
    { value: 'gestore_cucine', label: 'Gestore Cucine' },
    { value: 'socio_volontario', label: 'Socio Volontario' },
    { value: 'socio_ordinario', label: 'Socio Ordinario' },
    { value: 'simpatizzante', label: 'Simpatizzante' },
  ]

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Nuovo Socio</h1>
      <div className="card max-w-3xl">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormInput
              label="Email"
              type="email"
              id="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />

            <FormInput
              label="Nome"
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              required
            />

            <FormInput
              label="Cognome"
              id="cognome"
              value={formData.cognome}
              onChange={(e) => setFormData({ ...formData, cognome: e.target.value })}
              required
            />

            <FormInput
              label="Telefono"
              type="tel"
              id="telefono"
              value={formData.telefono}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
            />

            <FormSelect
              label="Tipo Persona"
              id="tipo_persona"
              value={formData.tipo_persona}
              onChange={(e) => setFormData({ ...formData, tipo_persona: e.target.value })}
              options={[
                { value: 'fisica', label: 'Persona Fisica' },
                { value: 'giuridica', label: 'Persona Giuridica' },
              ]}
            />

            {formData.tipo_persona === 'giuridica' && (
              <>
                <FormInput
                  label="Ragione Sociale"
                  id="ragione_sociale"
                  value={formData.ragione_sociale}
                  onChange={(e) => setFormData({ ...formData, ragione_sociale: e.target.value })}
                  required={formData.tipo_persona === 'giuridica'}
                />

                <FormInput
                  label="Partita IVA"
                  id="partita_iva"
                  value={formData.partita_iva}
                  onChange={(e) => setFormData({ ...formData, partita_iva: e.target.value })}
                />
              </>
            )}

            <FormSelect
              label="Categoria Socio"
              id="categoria_socio"
              value={formData.categoria_socio}
              onChange={(e) => setFormData({ ...formData, categoria_socio: e.target.value })}
              options={categoriaOptions}
              required
            />

            <FormSelect
              label="Ruolo Sistema"
              id="ruolo"
              value={formData.ruolo}
              onChange={(e) => setFormData({ ...formData, ruolo: e.target.value })}
              options={ruoloOptions}
              required
            />

            <FormInput
              label="Indirizzo"
              id="indirizzo"
              value={formData.indirizzo}
              onChange={(e) => setFormData({ ...formData, indirizzo: e.target.value })}
            />

            <FormInput
              label="Città"
              id="citta"
              value={formData.citta}
              onChange={(e) => setFormData({ ...formData, citta: e.target.value })}
            />

            <FormInput
              label="CAP"
              id="cap"
              value={formData.cap}
              onChange={(e) => setFormData({ ...formData, cap: e.target.value })}
            />
          </div>

          {/* La password provvisoria la genera l'app: nessuno deve inventarla
              ne' ricordarla, e parte direttamente verso il socio. */}
          <div className="mt-6">
            <Nota>
              Riceverà per {formData.telefono ? 'email e WhatsApp' : 'email'} i dati di accesso, con una password
              provvisoria generata dall'app.
              {!formData.telefono && ' Inserisci il telefono per mandarli anche su WhatsApp.'}
            </Nota>
          </div>

          <div className="flex gap-4 mt-6">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creazione...' : 'Crea Socio'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/soci')}
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

export default SociCreate


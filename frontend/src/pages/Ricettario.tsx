import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRitardato } from '../hooks/useRitardato'
import { api } from '../services/authService'
import { toast } from 'react-hot-toast'
import { Plus, Edit, Trash2, Archive, ArchiveRestore, Search, ChefHat } from 'lucide-react'
import { useState } from 'react'
import Modal from '../components/Modal'
import { FormInput, FormSelect, FormTextarea } from '../components/FormInput'
import { useAuth } from '../contexts/AuthContext'
import {
  AzionePrincipale,
  BottoneGrande,
  Caricamento,
  Elenco,
  IntestazionePagina,
  Occhiello,
  Pagina,
  Riga,
  Vuoto,
} from '../components/ui'

interface Ricetta {
  id: string
  nome_ricetta: string
  descrizione?: string
  tipo_ricetta: string
  ingredienti?: any
  istruzioni?: string
  porzioni?: number
  note_alimentari?: string
  globale: boolean
  archiviato: boolean
  creatore_nome?: string
  created_at: string
}

const TIPI_RICETTA = [
  { value: 'primi', label: 'Primi' },
  { value: 'secondi', label: 'Secondi' },
  { value: 'contorni', label: 'Contorni' },
  { value: 'dolci', label: 'Dolci' },
  { value: 'pane', label: 'Pane' },
  { value: 'acqua', label: 'Bevande' },
  { value: 'frutta', label: 'Frutta' },
  { value: 'altro', label: 'Altro' },
]

export default function Ricettario() {
  const { user } = useAuth()
  const isAdmin = user?.ruolo === 'admin' || user?.ruolo === 'gestore_cucine'
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [mostraArchiviate, setMostraArchiviate] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [ricettaEdit, setRicettaEdit] = useState<Ricetta | null>(null)
  const [formData, setFormData] = useState({
    nome_ricetta: '',
    descrizione: '',
    tipo_ricetta: '',
    ingredienti: [] as any[],
    istruzioni: '',
    porzioni: '',
    note_alimentari: '',
  })

  // Il testo cercato entra nella chiave della query solo quando si smette di
  // scrivere, e intanto restano a schermo i risultati di prima. Prima ogni
  // lettera era una query nuova senza dati: la pagina tornava a
  // «Caricamento», il campo di ricerca veniva smontato e sul telefono la
  // tastiera si chiudeva dopo una lettera.
  const cerca = useRitardato(searchTerm.trim())
  const { data, isLoading } = useQuery({
    queryKey: ['ricettario', tipoFiltro, mostraArchiviate, cerca],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (tipoFiltro) params.append('tipo_ricetta', tipoFiltro)
      if (mostraArchiviate) params.append('archiviato', 'true')
      if (cerca) params.append('search', cerca)
      
      const res = await api.get(`/ricettario?${params.toString()}`)
      return res.data.ricette as Ricetta[]
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await api.post('/ricettario', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ricettario'] })
      toast.success('Ricetta creata!')
      setIsModalOpen(false)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la creazione')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await api.put(`/ricettario/${id}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ricettario'] })
      toast.success('Ricetta aggiornata!')
      setIsModalOpen(false)
      setRicettaEdit(null)
      resetForm()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'aggiornamento')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/ricettario/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ricettario'] })
      toast.success('Ricetta eliminata!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'eliminazione')
    },
  })

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archiviato }: { id: string; archiviato: boolean }) => {
      await api.post(`/ricettario/${id}/archivia`, { archiviato })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ricettario'] })
      toast.success('Ricetta archiviata!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'archiviazione')
    },
  })

  const resetForm = () => {
    setFormData({
      nome_ricetta: '',
      descrizione: '',
      tipo_ricetta: '',
      ingredienti: [],
      istruzioni: '',
      porzioni: '',
      note_alimentari: '',
    })
  }

  const handleEdit = (ricetta: Ricetta) => {
    setRicettaEdit(ricetta)
    setFormData({
      nome_ricetta: ricetta.nome_ricetta,
      descrizione: ricetta.descrizione || '',
      tipo_ricetta: ricetta.tipo_ricetta,
      ingredienti: ricetta.ingredienti || [],
      istruzioni: ricetta.istruzioni || '',
      porzioni: ricetta.porzioni?.toString() || '',
      note_alimentari: ricetta.note_alimentari || '',
    })
    setIsModalOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validazione lato client
    if (!formData.nome_ricetta || formData.nome_ricetta.trim() === '') {
      toast.error('Il nome della ricetta è obbligatorio')
      return
    }
    
    if (!formData.tipo_ricetta || formData.tipo_ricetta.trim() === '') {
      toast.error('Il tipo di ricetta è obbligatorio')
      return
    }
    
    const data = {
      nome_ricetta: formData.nome_ricetta.trim(),
      descrizione: formData.descrizione.trim() || null,
      tipo_ricetta: formData.tipo_ricetta,
      ingredienti: Array.isArray(formData.ingredienti) && formData.ingredienti.length > 0 
        ? formData.ingredienti 
        : null,
      istruzioni: formData.istruzioni.trim() || null,
      porzioni: formData.porzioni ? parseInt(formData.porzioni) : null,
      note_alimentari: formData.note_alimentari.trim() || null,
    }

    if (ricettaEdit) {
      updateMutation.mutate({ id: ricettaEdit.id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('Sei sicuro di voler eliminare questa ricetta?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleArchive = (ricetta: Ricetta) => {
    archiveMutation.mutate({ id: ricetta.id, archiviato: !ricetta.archiviato })
  }

  const ricettePerTipo = data?.reduce((acc, ricetta) => {
    const tipo = ricetta.tipo_ricetta || 'altro'
    if (!acc[tipo]) acc[tipo] = []
    acc[tipo].push(ricetta)
    return acc
  }, {} as Record<string, Ricetta[]>)

  if (isLoading) return <Caricamento cosa="del ricettario" />

  const apriNuova = () => {
    resetForm()
    setRicettaEdit(null)
    setIsModalOpen(true)
  }

  return (
    <Pagina azione={isAdmin}>
      <IntestazionePagina
        titolo="Ricettario"
        azioni={
          isAdmin ? (
            <button
              type="button"
              onClick={apriNuova}
              className="hidden h-11 flex-none items-center gap-2 rounded-xl bg-giallo px-4 text-sm font-semibold text-gray-900 transition hover:bg-giallo-scuro lg:flex"
            >
              <Plus className="h-4 w-4" />
              Nuova ricetta
            </button>
          ) : undefined
        }
      />

      <div className="mb-5 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cerca una ricetta"
            className="input min-h-[48px] pl-11"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            aria-label="Filtra per tipo"
            className="input min-h-[48px] w-auto"
          >
            {[{ value: '', label: 'Tutti i tipi' }, ...TIPI_RICETTA].map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={mostraArchiviate}
              onChange={(e) => setMostraArchiviate(e.target.checked)}
            />
            Archiviate
          </label>
        </div>
      </div>

      {ricettePerTipo && Object.keys(ricettePerTipo).length > 0 ? (
        <div className="flex flex-col gap-6">
          {Object.entries(ricettePerTipo).map(([tipo, ricette]) => (
            <section key={tipo}>
              <Occhiello>{TIPI_RICETTA.find((t) => t.value === tipo)?.label || tipo}</Occhiello>
              <Elenco>
                {ricette.map((ricetta) => (
                  <Riga
                    key={ricetta.id}
                    titolo={ricetta.nome_ricetta}
                    dettaglio={[
                      ricetta.porzioni ? `${ricetta.porzioni} porzioni` : null,
                      ricetta.archiviato ? 'archiviata' : ricetta.descrizione,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    tinta={ricetta.archiviato ? 'bg-gray-50 text-gray-400' : 'bg-gray-100 text-gray-600'}
                    icona={<ChefHat className="h-4 w-4" />}
                    coda={
                      isAdmin ? (
                        <span className="flex">
                          <button
                            type="button"
                            onClick={() => handleEdit(ricetta)}
                            aria-label="Modifica ricetta"
                            title="Modifica"
                            className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          >
                            <Edit className="h-[18px] w-[18px]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleArchive(ricetta)}
                            aria-label={ricetta.archiviato ? 'Ripristina ricetta' : 'Archivia ricetta'}
                            title={ricetta.archiviato ? 'Ripristina' : 'Archivia'}
                            className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          >
                            {ricetta.archiviato ? (
                              <ArchiveRestore className="h-[18px] w-[18px]" />
                            ) : (
                              <Archive className="h-[18px] w-[18px]" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(ricetta.id)}
                            aria-label="Elimina ricetta"
                            title="Elimina"
                            className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-[18px] w-[18px]" />
                          </button>
                        </span>
                      ) : undefined
                    }
                  />
                ))}
              </Elenco>
            </section>
          ))}
        </div>
      ) : (
        <Vuoto
          icona={<ChefHat className="mx-auto h-12 w-12" aria-hidden="true" />}
          titolo="Nessuna ricetta"
          spiegazione={isAdmin ? 'Aggiungi la prima: i turni potranno collegarla agli slot.' : undefined}
        />
      )}

      {isAdmin && (
        <AzionePrincipale>
          <BottoneGrande onClick={apriNuova}>
            <Plus className="h-5 w-5" />
            Nuova ricetta
          </BottoneGrande>
        </AzionePrincipale>
      )}

      {/* Modal creazione/modifica */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false)
          setRicettaEdit(null)
          resetForm()
        }}
        title={ricettaEdit ? 'Modifica Ricetta' : 'Nuova Ricetta'}
        size="lg"
      >
        <form onSubmit={handleSubmit}>
          <FormInput
            label="Nome Ricetta"
            id="nome_ricetta"
            value={formData.nome_ricetta}
            onChange={(e) => setFormData({ ...formData, nome_ricetta: e.target.value })}
            required
          />

          <FormSelect
            label="Tipo Ricetta"
            id="tipo_ricetta"
            value={formData.tipo_ricetta}
            onChange={(e) => setFormData({ ...formData, tipo_ricetta: e.target.value })}
            options={TIPI_RICETTA}
            required
          />

          <FormTextarea
            label="Descrizione"
            id="descrizione"
            value={formData.descrizione}
            onChange={(e) => setFormData({ ...formData, descrizione: e.target.value })}
            rows={3}
          />

          <FormInput
            label="Porzioni"
            type="number"
            id="porzioni"
            value={formData.porzioni}
            onChange={(e) => setFormData({ ...formData, porzioni: e.target.value })}
            min="1"
          />

          <FormTextarea
            label="Istruzioni"
            id="istruzioni"
            value={formData.istruzioni}
            onChange={(e) => setFormData({ ...formData, istruzioni: e.target.value })}
            rows={5}
          />

          <FormTextarea
            label="Note Alimentari (allergeni, esclusioni, etc.)"
            id="note_alimentari"
            value={formData.note_alimentari}
            onChange={(e) => setFormData({ ...formData, note_alimentari: e.target.value })}
            rows={3}
          />

          <div className="flex gap-4 mt-6">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {ricettaEdit ? 'Aggiorna' : 'Crea'} Ricetta
            </button>
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false)
                setRicettaEdit(null)
                resetForm()
              }}
              className="btn btn-secondary"
            >
              Annulla
            </button>
          </div>
        </form>
      </Modal>
    </Pagina>
  )
}


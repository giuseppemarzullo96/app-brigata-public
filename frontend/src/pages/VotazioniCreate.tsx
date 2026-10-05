import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/authService'
import { Plus, Trash2, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

interface Candidato {
  user_id: string | null
  nome: string
  cognome: string
}

const VotazioniCreate = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [titolo, setTitolo] = useState('')
  const [descrizione, setDescrizione] = useState('')
  const [assembleaId, setAssembleaId] = useState('')
  const [seggi, setSeggi] = useState(3)
  const [preferenze, setPreferenze] = useState(3)
  // Se l'admin non tocca il campo, le preferenze seguono i seggi.
  const [preferenzeManuali, setPreferenzeManuali] = useState(false)
  const [candidati, setCandidati] = useState<Candidato[]>([])
  const [socioScelto, setSocioScelto] = useState('')

  const { data: sociData } = useQuery({
    queryKey: ['soci-per-candidatura'],
    queryFn: async () => (await api.get('/users')).data,
  })

  const { data: assembleeData } = useQuery({
    queryKey: ['assemblee-per-votazione'],
    queryFn: async () => (await api.get('/assemblee')).data,
  })

  const soci = (sociData?.users || sociData?.soci || []).filter(
    (u: any) => !u.fittizio && u.ruolo !== 'esterno'
  )
  const assemblee = assembleeData?.assemblee || []

  const aggiornaSeggi = (valore: number) => {
    setSeggi(valore)
    if (!preferenzeManuali) setPreferenze(valore)
  }

  const aggiungiSocio = () => {
    if (!socioScelto) return
    const socio = soci.find((s: any) => s.id === socioScelto)
    if (!socio) return
    if (candidati.some((c) => c.user_id === socio.id)) {
      toast.error('Questo socio è già fra i candidati')
      return
    }
    setCandidati([
      ...candidati,
      { user_id: socio.id, nome: socio.nome, cognome: socio.cognome },
    ])
    setSocioScelto('')
  }

  const aggiungiEsterno = () => {
    setCandidati([...candidati, { user_id: null, nome: '', cognome: '' }])
  }

  const aggiornaCandidato = (indice: number, campo: 'nome' | 'cognome', valore: string) => {
    const copia = [...candidati]
    copia[indice] = { ...copia[indice], [campo]: valore }
    setCandidati(copia)
  }

  const rimuoviCandidato = (indice: number) => {
    setCandidati(candidati.filter((_, i) => i !== indice))
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/votazioni', {
        titolo,
        descrizione: descrizione || null,
        assemblea_id: assembleaId || null,
        seggi_da_eleggere: seggi,
        preferenze_max: preferenze,
        candidati: candidati.filter((c) => c.nome.trim() && c.cognome.trim()),
      })
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['votazioni'] })
      toast.success('Votazione creata in bozza')
      navigate(`/votazioni/${data.votazione.id}`)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la creazione')
    },
  })

  const candidatiValidi = candidati.filter((c) => c.nome.trim() && c.cognome.trim())
  const erroreCandidati =
    candidatiValidi.length > 0 && candidatiValidi.length < seggi
      ? `Servono almeno ${seggi} candidati per assegnare ${seggi} seggi`
      : null

  const puoSalvare =
    titolo.trim().length > 0 && seggi >= 1 && preferenze >= 1 && preferenze <= seggi

  return (
    <div className="max-w-3xl">
      <Link to="/votazioni" className="inline-flex items-center text-sm text-gray-600 mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Torna alle votazioni
      </Link>

      <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-6">Nuova Votazione</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          createMutation.mutate()
        }}
        className="space-y-6"
      >
        <div className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titolo *</label>
            <input
              type="text"
              className="input w-full"
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder="Rinnovo del consiglio direttivo"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
            <textarea
              className="input w-full"
              rows={3}
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Testo che comparirà anche sul verbale"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assemblea collegata
            </label>
            <select
              className="input w-full"
              value={assembleaId}
              onChange={(e) => setAssembleaId(e.target.value)}
            >
              <option value="">Nessuna</option>
              {assemblee.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.titolo}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Membri da rinnovare *
              </label>
              <input
                type="number"
                min={1}
                className="input w-full"
                value={seggi}
                onChange={(e) => aggiornaSeggi(Number(e.target.value))}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Quanti posti del consiglio direttivo vanno assegnati.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Preferenze per elettore *
              </label>
              <input
                type="number"
                min={1}
                max={seggi}
                className="input w-full"
                value={preferenze}
                onChange={(e) => {
                  setPreferenzeManuali(true)
                  setPreferenze(Number(e.target.value))
                }}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Di norma coincide con i membri da rinnovare. Non può superarli.
              </p>
            </div>
          </div>

          {preferenze > seggi && (
            <p className="text-sm text-red-600">
              Le preferenze non possono superare i membri da rinnovare.
            </p>
          )}
        </div>

        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Candidati ({candidatiValidi.length})
            </h2>
            <button type="button" onClick={aggiungiEsterno} className="btn btn-secondary text-sm">
              <Plus className="w-4 h-4 mr-1 inline" />
              Candidato esterno
            </button>
          </div>

          <div className="flex gap-2">
            <select
              className="input flex-1"
              value={socioScelto}
              onChange={(e) => setSocioScelto(e.target.value)}
            >
              <option value="">Seleziona un socio…</option>
              {soci.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.cognome} {s.nome}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={aggiungiSocio}
              className="btn btn-primary text-sm"
              disabled={!socioScelto}
            >
              Aggiungi
            </button>
          </div>

          {candidati.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nessun candidato. Puoi aggiungerli anche dopo, finché la votazione resta in bozza.
            </p>
          ) : (
            <ul className="space-y-2">
              {candidati.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="text-sm text-gray-400 w-6">{i + 1}.</span>
                  {c.user_id ? (
                    <span className="flex-1 text-sm text-gray-900">
                      {c.cognome} {c.nome}
                      <span className="text-xs text-gray-500 ml-2">(socio)</span>
                    </span>
                  ) : (
                    <>
                      <input
                        type="text"
                        className="input flex-1"
                        placeholder="Nome"
                        value={c.nome}
                        onChange={(e) => aggiornaCandidato(i, 'nome', e.target.value)}
                      />
                      <input
                        type="text"
                        className="input flex-1"
                        placeholder="Cognome"
                        value={c.cognome}
                        onChange={(e) => aggiornaCandidato(i, 'cognome', e.target.value)}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => rimuoviCandidato(i)}
                    aria-label="Togli questo candidato"
                    className="btn btn-danger text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {erroreCandidati && <p className="text-sm text-amber-600">{erroreCandidati}</p>}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!puoSalvare || createMutation.isPending}
          >
            {createMutation.isPending ? 'Creazione…' : 'Crea in bozza'}
          </button>
          <Link to="/votazioni" className="btn btn-secondary">
            Annulla
          </Link>
        </div>

        <p className="text-sm text-gray-500">
          La votazione viene creata in bozza: nessuno la vede finché non la apri. Fino a quel
          momento puoi ancora modificare candidati e numero di seggi.
        </p>
      </form>
    </div>
  )
}

export default VotazioniCreate

import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Paperclip, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../services/authService'
import { scaricaFile } from '../services/scarica'

/**
 * Allegati al verbale di un'assemblea o di una riunione del Consiglio:
 * deleghe firmate, fogli firme, relazioni. Il verbale li elenca per titolo.
 * Caricano ed eliminano gli admin; scarica chi puo' vedere l'assemblea.
 */

const ESTENSIONI = '.pdf,.doc,.docx,.odt,.jpg,.jpeg,.png'

const dimensione = (byte: number) =>
  byte > 1024 * 1024 ? `${(byte / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(byte / 1024))} KB`

const AllegatiVerbale = ({ assembleaId, isAdmin }: { assembleaId: string; isAdmin: boolean }) => {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [titolo, setTitolo] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const { data } = useQuery({
    queryKey: ['assemblea', assembleaId],
    queryFn: async () => (await api.get(`/assemblee/${assembleaId}`)).data,
  })
  const allegati: any[] = data?.allegati || []

  const invalida = () => {
    queryClient.invalidateQueries({ queryKey: ['assemblea', assembleaId] })
  }

  const carica = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      form.append('titolo', titolo)
      form.append('allegato_verbale', file as File)
      return (await api.post(`/assemblee/${assembleaId}/allegati`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })).data
    },
    onSuccess: () => {
      invalida()
      setTitolo('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      toast.success('Allegato caricato')
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Caricamento non riuscito'),
  })

  const elimina = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/assemblee/${assembleaId}/allegati/${id}`)).data,
    onSuccess: () => { invalida(); toast.success('Allegato eliminato') },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Eliminazione non riuscita'),
  })

  if (!isAdmin && allegati.length === 0) return null

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-1">
        <Paperclip className="w-4 h-4" />
        Allegati al verbale
      </h3>
      {isAdmin && (
        <p className="text-xs text-gray-500 mb-2">
          Deleghe firmate, fogli firme, relazioni: nel verbale compaiono con il loro titolo.
        </p>
      )}

      {allegati.length === 0 ? (
        <p className="text-sm text-gray-500 mb-3">Nessun allegato.</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded mb-3">
          {allegati.map((a) => (
            <li key={a.id} className="p-2 flex items-center gap-2 text-sm">
              <button
                className="flex-1 text-left text-primary-700 hover:underline"
                onClick={() => scaricaFile(`/assemblee/${assembleaId}/allegati/${a.id}`, a.nome_file)}
              >
                {a.titolo}
                <span className="block text-xs text-gray-500">
                  {a.nome_file}{a.dimensione ? ` · ${dimensione(a.dimensione)}` : ''}
                </span>
              </button>
              {isAdmin && (
                <button
                  className="btn btn-secondary text-xs"
                  title="Elimina"
                  onClick={() => { if (confirm(`Eliminare «${a.titolo}»?`)) elimina.mutate(a.id) }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input className="input flex-1" placeholder="Titolo (es. Foglio firme dei presenti)" value={titolo}
            onChange={(e) => setTitolo(e.target.value)} />
          <input ref={fileRef} type="file" accept={ESTENSIONI} className="text-sm"
            onChange={(e) => setFile(e.target.files?.[0] || null)} />
          <button className="btn btn-secondary text-sm" disabled={!file || carica.isPending}
            onClick={() => carica.mutate()}>
            <Upload className="w-4 h-4 mr-1 inline" />
            {carica.isPending ? 'Caricamento…' : 'Allega'}
          </button>
        </div>
      )}
    </div>
  )
}

export default AllegatiVerbale

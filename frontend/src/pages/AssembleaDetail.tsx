import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../services/authService'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { FileText, Users, Mail, CheckCircle, XCircle, Calendar, MapPin, Upload, Trash2, FileCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { useRef } from 'react'
import { scaricaFile } from '../services/scarica'
import VerbaleConsiglio from '../components/VerbaleConsiglio'
import AllegatiVerbale from '../components/AllegatiVerbale'
import GeneraConvocazione from '../components/GeneraConvocazione'

const AssembleaDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = user?.ruolo === 'admin'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const convocazioneInputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['assemblea', id],
    queryFn: async () => {
      const response = await api.get(`/assemblee/${id}`)
      return response.data
    },
  })

  const { data: presenzeData } = useQuery({
    queryKey: ['assemblea', id, 'presenze'],
    queryFn: async () => {
      const response = await api.get(`/assemblee/${id}/presenze`)
      return response.data
    },
    enabled: isAdmin, // Solo admin ha bisogno delle presenze
  })

  const inviaConvocazioniMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/assemblee/${id}/invia-convocazioni`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assemblea', id] })
      toast.success('Convocazioni inviate con successo!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'invio')
    },
  })

  const registraPresenzaMutation = useMutation({
    mutationFn: async (presenza: boolean) => {
      await api.put(`/assemblee/${id}/presenza`, { presenza })
    },
    onSuccess: (_, presenza) => {
      queryClient.invalidateQueries({ queryKey: ['assemblea', id] })
      queryClient.invalidateQueries({ queryKey: ['assemblea', id, 'presenze'] })
      toast.success(presenza ? 'Presenza registrata! ✅' : 'Assenza registrata! ❌')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore')
    },
  })

  const uploadVerbaleMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('verbale', file)
      const response = await api.post(`/assemblee/${id}/verbale`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assemblea', id] })
      toast.success('Verbale caricato con successo!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante il caricamento')
    },
  })

  const uploadConvocazioneMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('convocazione', file)
      const response = await api.post(`/assemblee/${id}/convocazione`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assemblea', id] })
      toast.success('Convocazione caricata con successo!')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante il caricamento')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/assemblee/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assemblee'] })
      toast.success('Assemblea eliminata con successo')
      navigate('/assemblee')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante l\'eliminazione')
    },
  })

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadVerbaleMutation.mutate(file)
    }
  }

  const handleConvocazioneUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadConvocazioneMutation.mutate(file)
    }
  }

  if (isLoading) {
    return <div>Caricamento...</div>
  }

  const assemblea = data?.assemblea
  const presenze = presenzeData?.presenze || []
  const presenzaUtente = data?.presenzaUtente ?? null

  if (!assemblea) {
    return <div>Assemblea non trovata</div>
  }

  const presenti = presenze.filter((p: any) => p.presenza === true).length
  const assenti = presenze.filter((p: any) => p.presenza === false).length
  const nonRisposti = presenze.filter((p: any) => p.presenza === null).length
  const consiglio = assemblea.tipo_assemblea === 'consiglio'

  // Documenti per chi non e' admin: verbale caricato e, per il Consiglio, il
  // verbale generato dall'app. Il server li serve solo a chi puo' vederli.
  const documentiSocio = (assemblea.verbale_path || (consiglio && assemblea.dati_verbale)) && (
    <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
      <h3 className="font-semibold mb-3 text-gray-900">Verbale</h3>
      <div className="flex flex-wrap gap-3">
        {assemblea.verbale_path && (
          <button
            onClick={() => scaricaFile(`/assemblee/${id}/verbale`, 'verbale')}
            className="btn btn-secondary text-sm flex items-center"
          >
            <FileText className="w-4 h-4 mr-2" />
            {consiglio ? 'Verbale firmato' : 'Scarica il verbale'}
          </button>
        )}
        {consiglio && assemblea.dati_verbale && (
          <button
            onClick={() => scaricaFile(`/assemblee/${id}/verbale-consiglio`, 'verbale-consiglio.pdf')}
            className="btn btn-secondary text-sm flex items-center"
          >
            <FileText className="w-4 h-4 mr-2" />
            Verbale del Consiglio (PDF)
          </button>
        )}
      </div>
    </div>
  )

  // Versione semplificata per non admin
  if (!isAdmin) {
    return (
      <div>
        <button
          onClick={() => navigate('/assemblee')}
          className="text-primary-600 hover:text-primary-700 mb-4"
        >
          ← Torna alle assemblee
        </button>

        <div className="card mb-6">
          <div className="mb-6">
            {consiglio && (
              <span className="inline-block mb-2 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-medium">
                Consiglio direttivo · riservato ai consiglieri
              </span>
            )}
            <h1 className="text-2xl font-bold text-gray-900 mb-4">{assemblea.titolo}</h1>
            <div className="space-y-2 text-gray-600">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{format(new Date(assemblea.data_assemblea), 'EEEE d MMMM yyyy, HH:mm', { locale: it })}</span>
              </div>
              {assemblea.luogo && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{assemblea.luogo}</span>
                </div>
              )}
            </div>
          </div>

          {documentiSocio}

          <div className="mb-6">
            <AllegatiVerbale assembleaId={id!} isAdmin={false} />
          </div>

          {assemblea.stato === 'programmata' && (
            <div className="pt-6 border-t">
              {/* Mostra convocazione se disponibile */}
              {assemblea.convocazione_path && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-5 h-5 text-blue-600" />
                      <span className="font-medium text-gray-900">Convocazione</span>
                    </div>
                    <button
                      onClick={() => scaricaFile(`/assemblee/${id}/convocazione`, 'convocazione.pdf')}
                      className="btn btn-secondary text-sm flex items-center"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Scarica PDF
                    </button>
                  </div>
                </div>
              )}

              <p className="text-sm font-medium text-gray-700 mb-4 text-center">
                {presenzaUtente === true && (
                  <span className="text-green-600 flex items-center justify-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Hai confermato la tua presenza
                  </span>
                )}
                {presenzaUtente === false && (
                  <span className="text-red-600 flex items-center justify-center gap-2">
                    <XCircle className="w-5 h-5" />
                    Hai comunicato la tua assenza
                  </span>
                )}
                {presenzaUtente === null && (
                  <span className="text-gray-600">Conferma la tua presenza</span>
                )}
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => registraPresenzaMutation.mutate(true)}
                  disabled={registraPresenzaMutation.isPending}
                  className={`btn flex-1 max-w-xs flex items-center justify-center ${
                    presenzaUtente === true
                      ? 'btn-primary bg-primary-600 hover:bg-primary-700'
                      : 'btn-primary'
                  }`}
                >
                  <CheckCircle className="w-5 h-5 mr-2" />
                  {presenzaUtente === true ? '✓ Presente' : 'Conferma Presenza'}
                </button>
                <button
                  onClick={() => registraPresenzaMutation.mutate(false)}
                  disabled={registraPresenzaMutation.isPending}
                  className={`btn flex-1 max-w-xs flex items-center justify-center ${
                    presenzaUtente === false
                      ? 'btn-danger bg-red-600 hover:bg-red-700'
                      : 'btn-secondary'
                  }`}
                >
                  <XCircle className="w-5 h-5 mr-2" />
                  {presenzaUtente === false ? '✓ Assente' : 'Comunica Assenza'}
                </button>
              </div>
            </div>
          )}

          {assemblea.stato !== 'programmata' && (
            <div className="pt-4 border-t">
              <p className="text-sm text-gray-500 text-center">
                L'assemblea non è più disponibile per la registrazione della presenza
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Versione completa per admin
  return (
    <div>
      <button
        onClick={() => navigate('/assemblee')}
        className="text-primary-600 hover:text-primary-700 mb-4"
      >
        ← Torna alle assemblee
      </button>

      <div className="card mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">{assemblea.titolo}</h1>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-gray-600 text-sm sm:text-base">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {format(new Date(assemblea.data_assemblea), 'EEEE d MMMM yyyy, HH:mm', { locale: it })}
              </div>
              {assemblea.luogo && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {assemblea.luogo}
                </div>
              )}
            </div>
          </div>
          <span className={`px-3 py-1 rounded text-sm font-medium ${
            assemblea.stato === 'conclusa' ? 'bg-green-100 text-green-800' :
            assemblea.stato === 'in_corso' ? 'bg-blue-100 text-blue-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {assemblea.stato}
          </span>
        </div>

        {assemblea.ordine_del_giorno && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">Ordine del Giorno</h3>
            <p className="text-sm text-gray-700 whitespace-pre-line">
              {assemblea.ordine_del_giorno}
            </p>
          </div>
        )}

        {/* Documenti caricati */}
        {(assemblea.convocazione_path || assemblea.verbale_path) && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
            <h3 className="font-semibold mb-3 text-gray-900">Documenti</h3>
            <div className="flex flex-wrap gap-3">
              {assemblea.convocazione_path && (
                <button
                  onClick={() => scaricaFile(`/assemblee/${id}/convocazione`, 'convocazione.pdf')}
                  className="btn btn-secondary text-sm flex items-center"
                >
                  <FileCheck className="w-4 h-4 mr-2" />
                  Convocazione PDF
                </button>
              )}
              {assemblea.verbale_path && (
                <button
                  onClick={() => scaricaFile(`/assemblee/${id}/verbale`, 'verbale')}
                  className="btn btn-secondary text-sm flex items-center"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  {consiglio ? 'Verbale firmato' : 'Verbale PDF'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Registrazione presenza per admin */}
        {assemblea.stato === 'programmata' && (
          <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold mb-3 text-gray-900">La tua presenza</h3>
            <p className="text-sm font-medium text-gray-700 mb-4">
              {presenzaUtente === true && (
                <span className="text-green-600 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Hai confermato la tua presenza
                </span>
              )}
              {presenzaUtente === false && (
                <span className="text-red-600 flex items-center gap-2">
                  <XCircle className="w-5 h-5" />
                  Hai comunicato la tua assenza
                </span>
              )}
              {presenzaUtente === null && (
                <span className="text-gray-600">Conferma la tua presenza</span>
              )}
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => registraPresenzaMutation.mutate(true)}
                disabled={registraPresenzaMutation.isPending}
                className={`btn flex-1 max-w-xs flex items-center justify-center ${
                  presenzaUtente === true
                    ? 'btn-primary bg-primary-600 hover:bg-primary-700'
                    : 'btn-primary'
                }`}
              >
                <CheckCircle className="w-5 h-5 mr-2" />
                {presenzaUtente === true ? '✓ Presente' : 'Conferma Presenza'}
              </button>
              <button
                onClick={() => registraPresenzaMutation.mutate(false)}
                disabled={registraPresenzaMutation.isPending}
                className={`btn flex-1 max-w-xs flex items-center justify-center ${
                  presenzaUtente === false
                    ? 'btn-danger bg-red-600 hover:bg-red-700'
                    : 'btn-secondary'
                }`}
              >
                <XCircle className="w-5 h-5 mr-2" />
                {presenzaUtente === false ? '✓ Assente' : 'Comunica Assenza'}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t flex-wrap">
          <button
            onClick={() => inviaConvocazioniMutation.mutate()}
            className="btn btn-primary text-sm flex items-center"
            disabled={inviaConvocazioniMutation.isPending}
          >
            <Mail className="w-4 h-4 mr-2" />
            Invia Convocazioni
          </button>
          <button
            onClick={() => {
              if (confirm('Sei sicuro di voler eliminare questa assemblea? Questa azione non può essere annullata.')) {
                deleteMutation.mutate()
              }
            }}
            className="btn btn-danger text-sm flex items-center"
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Elimina Assemblea
          </button>
          <GeneraConvocazione assemblea={assemblea} />
          <label className="btn btn-secondary text-sm flex items-center cursor-pointer">
            <FileCheck className="w-4 h-4 mr-2" />
            {uploadConvocazioneMutation.isPending ? 'Caricamento...' : 'Carica Convocazione'}
            <input
              ref={convocazioneInputRef}
              type="file"
              accept=".pdf"
              onChange={handleConvocazioneUpload}
              className="hidden"
            />
          </label>
          <label className="btn btn-secondary text-sm flex items-center cursor-pointer">
            <Upload className="w-4 h-4 mr-2" />
            {uploadVerbaleMutation.isPending ? 'Caricamento...' : 'Carica Verbale'}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
          <button
            onClick={() => scaricaFile(`/assemblee/${id}/presenze/export`, `presenze_assemblea_${id}.csv`)}
            className="btn btn-secondary text-sm flex items-center"
          >
            <FileText className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Allegati al verbale */}
      <div className="card mb-6">
        <AllegatiVerbale assembleaId={id!} isAdmin={isAdmin} />
      </div>

      {/* Verbale del Consiglio direttivo */}
      {consiglio && (
        <div className="card mb-6">
          <h2 className="text-xl font-semibold flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5" />
            Verbale del Consiglio direttivo
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Visibile solo ai consiglieri in carica alla data della riunione e agli amministratori.
          </p>
          <VerbaleConsiglio assembleaId={id!} titolo={assemblea.titolo} />
        </div>
      )}

      {/* Presenze */}
      {isAdmin && (
        <div className="card">
          <h2 className="text-xl font-semibold flex items-center gap-2 mb-4">
            <Users className="w-5 h-5" />
            Presenze ({presenze.length} convocati)
          </h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-700">{presenti}</p>
              <p className="text-sm text-green-600">Presenti</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-700">{assenti}</p>
              <p className="text-sm text-red-600">Assenti</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-700">{nonRisposti}</p>
              <p className="text-sm text-gray-600">Non risposti</p>
            </div>
          </div>

          {presenze.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold text-gray-700">Nome</th>
                    <th className="text-left p-3 font-semibold text-gray-700">Email</th>
                    <th className="text-left p-3 font-semibold text-gray-700">Presenza</th>
                  </tr>
                </thead>
                <tbody>
                  {presenze.map((presenza: any) => (
                    <tr key={presenza.id} className="border-b">
                      <td className="p-3">
                        {presenza.nome} {presenza.cognome}
                      </td>
                      <td className="p-3 text-sm text-gray-600">{presenza.email}</td>
                      <td className="p-3">
                        {presenza.presenza === true && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                            Presente
                          </span>
                        )}
                        {presenza.presenza === false && (
                          <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">
                            Assente
                          </span>
                        )}
                        {presenza.presenza === null && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                            Non risposto
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AssembleaDetail


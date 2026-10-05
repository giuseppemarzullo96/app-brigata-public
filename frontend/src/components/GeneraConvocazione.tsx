import { useState } from 'react'
import { format, subDays } from 'date-fns'
import { FileText } from 'lucide-react'
import { scaricaFile } from '../services/scarica'

/**
 * Pulsante per generare l'avviso di convocazione in PDF, da firmare e poi
 * caricare con "Carica Convocazione". Per le assemblee la data della riunione
 * e' la seconda convocazione (convenzione dell'associazione); la prima, di
 * default, e' il giorno prima alla stessa ora.
 */
const GeneraConvocazione = ({ assemblea }: { assemblea: any }) => {
  const consiglio = assemblea.tipo_assemblea === 'consiglio'
  const [aperto, setAperto] = useState(false)
  const [prima, setPrima] = useState(
    format(subDays(new Date(assemblea.data_assemblea), 1), "yyyy-MM-dd'T'HH:mm")
  )
  const [dataDocumento, setDataDocumento] = useState(format(new Date(), 'yyyy-MM-dd'))

  const scarica = () => {
    const params = new URLSearchParams({ data: dataDocumento })
    if (!consiglio) params.set('prima', prima)
    scaricaFile(`/assemblee/${assemblea.id}/convocazione-pdf?${params}`, 'convocazione.pdf')
  }

  if (!aperto) {
    return (
      <button className="btn btn-secondary text-sm flex items-center" onClick={() => setAperto(true)}>
        <FileText className="w-4 h-4 mr-2" />
        Genera convocazione PDF
      </button>
    )
  }

  return (
    <div className="w-full p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
      <p className="text-sm text-gray-700">
        {consiglio
          ? 'Convocazione del Consiglio direttivo, indirizzata ai consiglieri in carica.'
          : `La data dell'assemblea vale come seconda convocazione. Il PDF contiene anche il modulo di delega.`}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {!consiglio && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prima convocazione</label>
            <input type="datetime-local" className="input w-full" value={prima}
              onChange={(e) => setPrima(e.target.value)} />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data del documento</label>
          <input type="date" className="input w-full" value={dataDocumento}
            onChange={(e) => setDataDocumento(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary text-sm" onClick={scarica}>Scarica PDF</button>
        <button className="btn btn-secondary text-sm" onClick={() => setAperto(false)}>Chiudi</button>
      </div>
      <p className="text-xs text-gray-500">Firmalo e caricalo con «Carica Convocazione».</p>
    </div>
  )
}

export default GeneraConvocazione

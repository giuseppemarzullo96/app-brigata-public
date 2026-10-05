import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useRitardato } from '../hooks/useRitardato'
import { Link } from 'react-router-dom'
import { api } from '../services/authService'
import { Building2, Phone, Mail, MapPin } from 'lucide-react'
import { useState } from 'react'

const EntiFittizi = () => {
  const [search, setSearch] = useState('')

  // Il testo cercato entra nella chiave della query solo quando si smette di
  // scrivere, e intanto restano a schermo i risultati di prima. Prima ogni
  // lettera era una query nuova senza dati: la pagina tornava a
  // «Caricamento», il campo di ricerca veniva smontato e sul telefono la
  // tastiera si chiudeva dopo una lettera.
  const cerca = useRitardato(search.trim())
  const { data, isLoading } = useQuery({
    queryKey: ['users', 'fittizi', cerca],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params: any = { fittizio: 'true' }
      if (cerca) params.search = cerca
      const response = await api.get('/users', { params })
      return response.data
    },
  })

  if (isLoading) {
    return <div>Caricamento enti fittizi...</div>
  }

  const enti = data?.users || []

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Enti e Utenti Fittizi</h1>
        <p className="text-gray-600 mt-1">
          Account non reali (parrocchie, associazioni, gruppi esterni) usati per assegnare slot dei turni senza registrare una persona fisica. Vengono creati dal dialog di assegnazione slot.
        </p>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Cerca per nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input max-w-sm"
        />
      </div>

      {enti.length === 0 ? (
        <div className="card text-center py-12">
          <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Nessun ente fittizio trovato</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {enti.map((ente: any) => (
            <Link
              key={ente.id}
              to={`/soci/${ente.id}`}
              className="card hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-primary-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 truncate">
                    {ente.ragione_sociale || `${ente.nome} ${ente.cognome}`}
                  </p>
                  <div className="mt-2 space-y-1 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{ente.email}</span>
                    </div>
                    {ente.telefono && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{ente.telefono}</span>
                      </div>
                    )}
                    {(ente.indirizzo || ente.citta) && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">
                          {[ente.indirizzo, ente.citta].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                  {ente.note && (
                    <p className="mt-2 text-xs text-gray-500 line-clamp-2">{ente.note}</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default EntiFittizi

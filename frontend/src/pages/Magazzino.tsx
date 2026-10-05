import { useQuery } from '@tanstack/react-query'
import { api } from '../services/authService'
import { AlertTriangle, Package, Plus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Link } from 'react-router-dom'
import {
  AzionePrincipale,
  BottoneGrande,
  Caricamento,
  Elenco,
  IntestazionePagina,
  Nota,
  Occhiello,
  Pagina,
  Riga,
  Vuoto,
} from '../components/ui'

/**
 * Magazzino.
 *
 * Era una tabella a sei colonne: sul telefono «quantità» e «stato» uscivano
 * dallo schermo. Ora ogni bene è una riga, e le scorte basse stanno sopra,
 * dette in parole.
 */

const Magazzino = () => {
  const { user } = useAuth()
  const isAdmin = user?.ruolo === 'admin'

  const { data: beniData, isLoading: beniLoading } = useQuery({
    queryKey: ['magazzino', 'beni'],
    queryFn: async () => (await api.get('/magazzino/beni')).data,
  })

  const { data: alertData } = useQuery({
    queryKey: ['magazzino', 'alert'],
    queryFn: async () => (await api.get('/magazzino/alert')).data,
  })

  if (beniLoading) return <Caricamento cosa="del magazzino" />

  const beni = beniData?.beni || []
  const alert = alertData?.alert || []

  return (
    <Pagina azione={isAdmin}>
      <IntestazionePagina
        titolo="Magazzino"
        azioni={
          isAdmin ? (
            <Link
              to="/magazzino/nuovo"
              className="hidden h-11 flex-none items-center gap-2 rounded-xl bg-giallo px-4 text-sm font-semibold text-gray-900 transition hover:bg-giallo-scuro lg:flex"
            >
              <Plus className="h-4 w-4" />
              Nuovo bene
            </Link>
          ) : undefined
        }
      />

      {alert.length > 0 && (
        <div className="mb-5">
          <Nota tono="urgente" icona={<AlertTriangle className="h-5 w-5 text-orange-700" aria-hidden="true" />}>
            <p className="font-semibold text-gray-900">
              {alert.length === 1 ? 'Una scorta è sotto il minimo' : `${alert.length} scorte sotto il minimo`}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {alert.slice(0, 4).map((item: any) => (
                <li key={item.id}>
                  {item.nome}: {item.quantita_disponibile} {item.unita_misura || ''}
                  {item.quantita_minima != null ? ` (minimo ${item.quantita_minima})` : ''}
                </li>
              ))}
            </ul>
          </Nota>
        </div>
      )}

      {beni.length === 0 ? (
        <Vuoto
          icona={<Package className="mx-auto h-12 w-12" aria-hidden="true" />}
          titolo="Magazzino vuoto"
          spiegazione={isAdmin ? 'Aggiungi il primo bene: quantità e minimo restano visibili da qui.' : undefined}
        />
      ) : (
        <section>
          <Occhiello>{beni.length === 1 ? '1 bene' : `${beni.length} beni`}</Occhiello>
          <Elenco>
            {beni.map((bene: any) => {
              const bassa = bene.quantita_disponibile <= bene.quantita_minima
              const unita = bene.unita_misura ? ` ${bene.unita_misura}` : ''
              return (
                <Riga
                  key={bene.id}
                  titolo={bene.nome}
                  dettaglio={[
                    bene.categoria_nome,
                    `${bene.quantita_disponibile}${unita}`,
                    bene.ubicazione,
                    bassa ? 'sotto il minimo' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  tinta={bassa ? 'bg-orange-50 text-orange-700' : 'bg-gray-100 text-gray-600'}
                  icona={<Package className="h-4 w-4" />}
                />
              )
            })}
          </Elenco>
        </section>
      )}

      {isAdmin && (
        <AzionePrincipale>
          <BottoneGrande to="/magazzino/nuovo">
            <Plus className="h-5 w-5" />
            Nuovo bene
          </BottoneGrande>
        </AzionePrincipale>
      )}
    </Pagina>
  )
}

export default Magazzino

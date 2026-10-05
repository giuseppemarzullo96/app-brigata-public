import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRitardato } from '../hooks/useRitardato'
import { Link } from 'react-router-dom'
import { api } from '../services/authService'
import { Ban, CheckCircle, Mail, Plus, Search, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useState } from 'react'
import toast from 'react-hot-toast'
import Modal from '../components/Modal'
import {
  AzionePrincipale,
  Occhiello,
  BottoneGrande,
  Caricamento,
  Elenco,
  IntestazionePagina,
  Pagina,
  Riga,
  Vuoto,
} from '../components/ui'

/**
 * Elenco soci.
 *
 * Era una tabella a sei colonne: sul telefono si scorreva di lato e i tasti
 * «Dettagli» / sospendi stavano in un pixel. Ora ogni persona è una riga
 * toccabile, con lo stato detto in parole.
 */

const CATEGORIA: Record<string, string> = {
  volontario: 'Volontario',
  ordinario: 'Ordinario',
  simpatizzante: 'Simpatizzante',
  esterno: 'Esterno',
}

type StatoQuota = 'pagata' | 'da_verificare' | 'da_pagare' | 'nessuna'

/** Lo stato della quota dell'anno: parola e colore dicono la stessa cosa. */
const QUOTA: Record<StatoQuota, { etichetta: string; breve: string; pill: string; numero: string }> = {
  pagata: { etichetta: 'Pagata', breve: 'pagata', pill: 'bg-primary-50 text-primary-700', numero: 'text-primary-700' },
  da_verificare: { etichetta: 'Da verificare', breve: 'da verificare', pill: 'bg-giallo-tenue text-gray-800', numero: 'text-gray-900' },
  da_pagare: { etichetta: 'Da pagare', breve: 'da pagare', pill: 'bg-orange-50 text-orange-700', numero: 'text-orange-700' },
  nessuna: { etichetta: 'Senza quota', breve: 'senza quota', pill: 'bg-gray-100 text-gray-500', numero: 'text-gray-500' },
}

const Soci = () => {
  const { user } = useAuth()
  const isAdmin = user?.ruolo === 'admin'
  const [search, setSearch] = useState('')
  // Cosa succederebbe inviando la quota: si mostra prima di mandare, perche'
  // un tocco sbagliato fa partire decine di messaggi che non si ritirano.
  const [anteprimaQuote, setAnteprimaQuote] = useState<any | null>(null)
  // Filtro per stato della quota dell'anno: si attiva toccando un contatore.
  const [filtroQuota, setFiltroQuota] = useState<StatoQuota | null>(null)
  const queryClient = useQueryClient()

  // Il testo cercato entra nella chiave della query solo quando si smette di
  // scrivere, e intanto restano a schermo i risultati di prima. Prima ogni
  // lettera era una query nuova senza dati: la pagina tornava a
  // «Caricamento», il campo di ricerca veniva smontato e sul telefono la
  // tastiera si chiudeva dopo una lettera.
  const cerca = useRitardato(search.trim())
  const { data, isLoading } = useQuery({
    queryKey: ['users', cerca],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params: any = { fittizio: 'false' }
      if (cerca) params.search = cerca
      const response = await api.get('/users', { params })
      return response.data
    },
  })

  const toggleSospensioneMutation = useMutation({
    mutationFn: async ({ id, sospeso }: { id: string; sospeso: boolean }) => {
      await api.put(`/users/${id}/sospendi`, { sospeso })
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success(variables.sospeso ? 'Socio sospeso' : 'Socio riattivato')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Errore durante la sospensione')
    },
  })

  const anteprimaQuoteMutation = useMutation({
    mutationFn: async () => (await api.get('/users/invita-quote-anno-corrente/anteprima')).data,
    onSuccess: (dati) => {
      if (dati.destinatari === 0) toast.success(`Tutti i soci attivi hanno già la quota ${dati.anno}`)
      else setAnteprimaQuote(dati)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Errore durante il calcolo dell'anteprima")
    },
  })

  const inviaQuoteMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/users/invita-quote-anno-corrente')
      return response.data
    },
    onSuccess: (dati) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setAnteprimaQuote(null)
      if (dati.quoteCreate === 0) toast.success(dati.message)
      else toast.success(`${dati.quoteCreate} quote ${dati.anno} create. I messaggi partono uno alla volta nei prossimi minuti.`, { duration: 7000 })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Errore durante l'invio delle quote")
    },
  })

  const handleToggleSospensione = (socio: any) => {
    if (socio.id === user?.id) {
      toast.error('Non puoi sospendere il tuo stesso account')
      return
    }
    const azione = socio.sospeso ? 'riattivare' : 'sospendere'
    if (!confirm(`Vuoi ${azione} ${socio.nome || socio.ragione_sociale}?`)) return
    toggleSospensioneMutation.mutate({ id: socio.id, sospeso: !socio.sospeso })
  }

  if (isLoading) return <Caricamento cosa="dei soci" />

  const tutti = data?.users || []
  const statoQuota = (u: any): StatoQuota => u.quota_stato || 'nessuna'
  const conta = (st: StatoQuota) => tutti.filter((u: any) => statoQuota(u) === st).length
  const users = isAdmin && filtroQuota ? tutti.filter((u: any) => statoQuota(u) === filtroQuota) : tutti

  return (
    <Pagina azione={isAdmin}>
      <IntestazionePagina
        titolo="Soci"
        azioni={
          isAdmin ? (
            <div className="hidden items-center gap-1 lg:flex">
              <button
                type="button"
                onClick={() => anteprimaQuoteMutation.mutate()}
                disabled={anteprimaQuoteMutation.isPending || inviaQuoteMutation.isPending}
                className="flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
              >
                <Mail className="h-4 w-4" />
                {anteprimaQuoteMutation.isPending ? 'Controllo…' : 'Quota anno'}
              </button>
              <Link
                to="/soci/nuovo"
                className="flex h-11 items-center gap-2 rounded-xl bg-giallo px-4 text-sm font-semibold text-gray-900 transition hover:bg-giallo-scuro"
              >
                <Plus className="h-4 w-4" />
                Nuovo socio
              </Link>
            </div>
          ) : undefined
        }
      />

      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          placeholder="Cerca per nome o email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input min-h-[48px] pl-11"
        />
      </div>

      {isAdmin && tutti.length > 0 && (
        <div className="mb-4">
          <Occhiello>Quota {data?.annoQuota}</Occhiello>
          <div className="grid grid-cols-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {(['pagata', 'da_verificare', 'da_pagare', 'nessuna'] as StatoQuota[]).map((st, i) => {
              const attivo = filtroQuota === st
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setFiltroQuota(attivo ? null : st)}
                  aria-pressed={attivo}
                  className={`flex min-h-[64px] flex-col items-center justify-center px-1 py-2 text-center transition ${
                    i > 0 ? 'border-l border-gray-200' : ''
                  } ${attivo ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                >
                  <span className={`font-display text-xl font-bold tabular-nums ${QUOTA[st].numero}`}>{conta(st)}</span>
                  <span className="text-[11px] leading-tight text-gray-500">{QUOTA[st].breve}</span>
                </button>
              )
            })}
          </div>
          {filtroQuota && (
            <p className="mt-2 flex items-center justify-between text-sm text-gray-500">
              <span>
                Solo: <strong className="text-gray-900">{QUOTA[filtroQuota].etichetta.toLowerCase()}</strong> ({users.length})
              </span>
              <button type="button" onClick={() => setFiltroQuota(null)} className="min-h-[44px] px-2 font-semibold text-primary-700">
                Mostra tutti
              </button>
            </p>
          )}
        </div>
      )}

      {isAdmin && (
        <button
          type="button"
          onClick={() => anteprimaQuoteMutation.mutate()}
          disabled={anteprimaQuoteMutation.isPending || inviaQuoteMutation.isPending}
          className="mb-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 lg:hidden"
        >
          <Mail className="h-4 w-4" />
          {anteprimaQuoteMutation.isPending ? 'Controllo…' : 'Invita a pagare la quota'}
        </button>
      )}

      {users.length === 0 ? (
        <Vuoto
          icona={<Users className="mx-auto h-12 w-12" aria-hidden="true" />}
          titolo={search ? 'Nessun risultato' : 'Nessun socio'}
          spiegazione={search ? 'Prova con un altro nome o un’altra email.' : undefined}
        />
      ) : (
        <Elenco>
          {users.map((socio: any) => {
            const nome = socio.ragione_sociale || `${socio.nome || ''} ${socio.cognome || ''}`.trim()
            const categoria = CATEGORIA[socio.categoria_socio] || socio.categoria_socio
            const stato = socio.sospeso ? 'sospeso' : socio.attivo ? categoria : 'inattivo'
            return (
              <Riga
                key={socio.id}
                to={`/soci/${socio.id}`}
                titolo={nome}
                dettaglio={`${stato}${socio.email ? ` · ${socio.email}` : ''}`}
                tinta={socio.sospeso ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}
                icona={<span className="text-xs font-bold">{(nome[0] || '?').toUpperCase()}</span>}
                coda={
                  isAdmin ? (
                    <span className="flex flex-none items-center gap-1">
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${QUOTA[statoQuota(socio)].pill}`}
                        title={`Quota ${data?.annoQuota}: ${QUOTA[statoQuota(socio)].etichetta.toLowerCase()}`}
                      >
                        {QUOTA[statoQuota(socio)].etichetta}
                      </span>
                      {socio.id !== user?.id ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleToggleSospensione(socio)
                      }}
                      aria-label={socio.sospeso ? 'Riattiva socio' : 'Sospendi socio'}
                      title={socio.sospeso ? 'Riattiva socio' : 'Sospendi socio'}
                      className="flex h-11 w-11 flex-none items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                    >
                      {socio.sospeso ? <CheckCircle className="h-[18px] w-[18px]" /> : <Ban className="h-[18px] w-[18px]" />}
                    </button>
                      ) : (
                        <span className="w-11 flex-none" />
                      )}
                    </span>
                  ) : undefined
                }
              />
            )
          })}
        </Elenco>
      )}

      {isAdmin && (
        <AzionePrincipale>
          <BottoneGrande to="/soci/nuovo">
            <Plus className="h-5 w-5" />
            Nuovo socio
          </BottoneGrande>
        </AzionePrincipale>
      )}

      {/* Conferma prima di creare le quote e mandare i messaggi */}
      {anteprimaQuote && (
        <Modal
          isOpen
          onClose={() => !inviaQuoteMutation.isPending && setAnteprimaQuote(null)}
          title={`Invitare a pagare la quota ${anteprimaQuote.anno}?`}
          sottotitolo={`${anteprimaQuote.importoTesto} a testa`}
          size="sm"
          piede={
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => inviaQuoteMutation.mutate()}
                disabled={inviaQuoteMutation.isPending}
                className="btn btn-primary min-h-[52px] w-full text-base"
              >
                {inviaQuoteMutation.isPending
                  ? 'Creo le quote…'
                  : `Crea ${anteprimaQuote.destinatari} quote e invia`}
              </button>
              <button
                type="button"
                onClick={() => setAnteprimaQuote(null)}
                disabled={inviaQuoteMutation.isPending}
                className="btn btn-secondary w-full"
              >
                Annulla
              </button>
            </div>
          }
        >
          <ul className="space-y-3 text-[15px] text-gray-700">
            <li>
              <strong className="text-gray-900">{anteprimaQuote.destinatari} soci</strong> ancora senza quota {anteprimaQuote.anno}: a ognuno viene creata la quota da {anteprimaQuote.importoTesto}.
            </li>
            <li>
              <strong className="text-gray-900">{anteprimaQuote.whatsapp} WhatsApp</strong> dal numero della Brigata, uno alla volta con una pausa fra l'uno e l'altro: ci vogliono alcuni minuti.
            </li>
            <li>
              <strong className="text-gray-900">{anteprimaQuote.email} email</strong>
              {anteprimaQuote.emailSaltate > 0 && (
                <> ({anteprimaQuote.emailSaltate} saltate: indirizzi creati d'ufficio, che non arrivano a nessuno)</>
              )}
              .
            </li>
            <li>Un avviso nell'app, solo per chi deve pagare.</li>
          </ul>
          <p className="mt-4 text-sm text-gray-500">Una volta partiti, i messaggi non si possono ritirare.</p>
        </Modal>
      )}
    </Pagina>
  )
}

export default Soci

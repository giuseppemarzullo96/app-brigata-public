import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/authService'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Euro, History, MessageSquare, Settings } from 'lucide-react'
import LinkCalendarioPubblico from '../components/LinkCalendarioPubblico'
import CartaIntestata from '../components/CartaIntestata'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { Caricamento, IntestazionePagina, Pagina, Vuoto } from '../components/ui'

const Impostazioni = () => {
  const { user } = useAuth()
  const isAdmin = user?.ruolo === 'admin'
  const queryClient = useQueryClient()

  const [quota, setQuota] = useState('')
  const [aggiornaEsistenti, setAggiornaEsistenti] = useState(false)
  const [mostraStorico, setMostraStorico] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['impostazioni'],
    queryFn: async () => (await api.get('/impostazioni')).data,
  })

  const quotaCorrente =
    data?.impostazioni?.find((i: any) => i.chiave === 'quota_annuale')?.valore ?? ''

  useEffect(() => {
    if (quotaCorrente) setQuota(quotaCorrente)
  }, [quotaCorrente])

  const { data: storicoData } = useQuery({
    queryKey: ['impostazioni-storico', 'quota_annuale'],
    queryFn: async () => (await api.get('/impostazioni/quota_annuale/storico')).data,
    enabled: Boolean(isAdmin && mostraStorico),
  })

  const chatAttiva =
    (data?.impostazioni?.find((i: any) => i.chiave === 'chat_attiva')?.valore ?? 'true') !== 'false'

  const chatMutation = useMutation({
    mutationFn: async (attiva: boolean) =>
      (await api.put('/impostazioni/chat_attiva', { valore: attiva ? 'true' : 'false' })).data,
    onSuccess: (_res, attiva) => {
      queryClient.invalidateQueries({ queryKey: ['impostazioni'] })
      toast.success(attiva ? 'Messaggi interni riattivati' : 'Messaggi interni disattivati')
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Errore durante il salvataggio'),
  })

  const salvaMutation = useMutation({
    mutationFn: async () =>
      (
        await api.put('/impostazioni/quota_annuale', {
          valore: quota,
          aggiorna_quote_non_pagate: aggiornaEsistenti,
        })
      ).data,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['impostazioni'] })
      queryClient.invalidateQueries({ queryKey: ['impostazioni-storico', 'quota_annuale'] })
      setAggiornaEsistenti(false)
      toast.success(
        res.quote_aggiornate > 0
          ? `Quota aggiornata. Allineate anche ${res.quote_aggiornate} quote non pagate.`
          : 'Quota aggiornata'
      )
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Errore durante il salvataggio'),
  })

  if (!isAdmin) {
    return (
      <Pagina>
        <Vuoto
          icona={<Settings className="mx-auto h-12 w-12" aria-hidden="true" />}
          titolo="Riservata agli amministratori"
          spiegazione="Quota, chat e chiavi di cifratura si gestiscono da qui."
        />
      </Pagina>
    )
  }

  if (isLoading) return <Caricamento cosa="delle impostazioni" />

  const modificata = quota !== quotaCorrente

  return (
    <Pagina>
      <IntestazionePagina
        titolo="Impostazioni"
        sottotitolo="Valori usati dall’app, senza toccare il codice"
      />

      <div className="flex flex-col gap-4">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-gray-500" aria-hidden="true" />
            <h2 className="text-base font-semibold text-gray-900">Messaggi interni</h2>
          </div>
          <p className="text-sm leading-relaxed text-gray-500">
            Spegnendoli, la sezione Messaggi sparisce dal menu e il server rifiuta ogni invio. Le
            conversazioni restano e tornano visibili quando li riaccendi.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-700">
              Ora sono <strong>{chatAttiva ? 'attivi' : 'disattivati'}</strong>
            </p>
            <button
              type="button"
              disabled={chatMutation.isPending}
              onClick={() => chatMutation.mutate(!chatAttiva)}
              className={`flex min-h-[44px] items-center rounded-xl px-4 text-sm font-semibold ${
                chatAttiva
                  ? 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                  : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}
            >
              {chatMutation.isPending ? 'Salvataggio…' : chatAttiva ? 'Disattiva' : 'Riattiva'}
            </button>
          </div>
        </section>

        <LinkCalendarioPubblico />

        <CartaIntestata />

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Euro className="h-5 w-5 text-gray-500" aria-hidden="true" />
            <h2 className="text-base font-semibold text-gray-900">Quota associativa annuale</h2>
          </div>
          <p className="text-sm leading-relaxed text-gray-500">
            Vale per le quote nuove. Quelle già pagate non si toccano.
          </p>
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault()
              salvaMutation.mutate()
            }}
          >
            <label className="block text-sm font-medium text-gray-700" htmlFor="quota">
              Importo in euro
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="quota"
                type="text"
                inputMode="decimal"
                className="input min-h-[48px] w-32"
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
                placeholder="15.00"
              />
              <span className="text-sm text-gray-500">€ all’anno</span>
            </div>
            <label className="mt-4 flex items-start gap-2.5 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={aggiornaEsistenti}
                onChange={(e) => setAggiornaEsistenti(e.target.checked)}
              />
              <span>
                Aggiorna anche le quote di quest’anno già create e non ancora pagate.
                <span className="mt-0.5 block text-gray-500">
                  Non tocca le quote pagate né quelle in attesa di validazione.
                </span>
              </span>
            </label>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="flex min-h-[44px] items-center rounded-xl bg-gray-900 px-5 text-sm font-semibold text-white disabled:opacity-50"
                disabled={salvaMutation.isPending || !modificata || !quota.trim()}
              >
                {salvaMutation.isPending ? 'Salvataggio…' : 'Salva'}
              </button>
              {modificata && (
                <button
                  type="button"
                  className="text-sm font-semibold text-gray-500"
                  onClick={() => setQuota(quotaCorrente)}
                >
                  Annulla
                </button>
              )}
              <span className="text-sm text-gray-500">In vigore: {quotaCorrente}€</span>
            </div>
          </form>
          <div className="mt-5 border-t border-gray-100 pt-4">
            <button
              type="button"
              className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-gray-700"
              onClick={() => setMostraStorico(!mostraStorico)}
            >
              <History className="h-4 w-4" />
              {mostraStorico ? 'Nascondi lo storico' : 'Storico delle variazioni'}
            </button>
            {mostraStorico && (
              <div className="mt-3">
                {!storicoData?.storico?.length ? (
                  <p className="text-sm text-gray-500">Nessuna variazione registrata.</p>
                ) : (
                  <ul className="space-y-2 text-sm text-gray-700">
                    {storicoData.storico.map((r: any, i: number) => (
                      <li key={i}>
                        {format(new Date(r.created_at), 'd MMM yyyy HH:mm', { locale: it })}
                        {' · da '}
                        <strong>{r.valore_precedente ?? '—'}€</strong>
                        {' a '}
                        <strong>{r.valore_nuovo}€</strong>
                        {r.cognome && (
                          <span className="text-gray-500">
                            {' — '}
                            {r.nome} {r.cognome}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>

      </div>
    </Pagina>
  )
}

export default Impostazioni

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'
import { Caricamento, Vuoto } from '../components/ui'

/**
 * La pagina a cui porta il QR della tessera digitale.
 *
 * Chi controlla (all'ingresso di un'assemblea, in cucina) inquadra il QR con
 * la fotocamera e vede se la tessera vale oggi: lo stato e' quello di adesso,
 * non quello del giorno in cui la tessera e' finita nel wallet. Ora e minuti
 * della verifica sono in pagina: uno screenshot vecchio si riconosce.
 *
 * Come il calendario pubblico, non usa il client dell'app: nessuna sessione.
 */

type Verifica = {
  intestatario: string
  numero: string
  anno: number
  stato: 'valida' | 'quota_non_pagata' | 'non_valida'
  categoria: string
  carica: string | null
  ruolo: string | null
}

const API = import.meta.env.VITE_API_URL || '/api/v1'

const ESITI = {
  valida: {
    icona: <ShieldCheck className="h-12 w-12" />,
    colori: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    titolo: (anno: number) => `Tessera valida per il ${anno}`,
  },
  quota_non_pagata: {
    icona: <ShieldAlert className="h-12 w-12" />,
    colori: 'border-amber-200 bg-amber-50 text-amber-700',
    titolo: (anno: number) => `Quota ${anno} non ancora pagata`,
  },
  non_valida: {
    icona: <ShieldX className="h-12 w-12" />,
    colori: 'border-red-200 bg-red-50 text-red-700',
    titolo: () => 'Tessera non valida',
  },
}

export default function VerificaTessera() {
  const { codice } = useParams()
  const [stato, setStato] = useState<'carico' | 'pronto' | 'non-trovata' | 'errore'>('carico')
  const [dati, setDati] = useState<Verifica | null>(null)
  const [quando, setQuando] = useState(new Date())

  useEffect(() => {
    document.title = 'Verifica tessera · La Brigata'
  }, [])

  useEffect(() => {
    let annullato = false
    fetch(`${API}/pubblico/tessera/${encodeURIComponent(codice || '')}`)
      .then(async (r) => {
        if (annullato) return
        if (r.status === 404) return setStato('non-trovata')
        if (!r.ok) return setStato('errore')
        const risposta = await r.json()
        if (annullato) return
        setDati(risposta)
        setQuando(new Date())
        setStato('pronto')
      })
      .catch(() => !annullato && setStato('errore'))
    return () => {
      annullato = true
    }
  }, [codice])

  return (
    <div className="min-h-screen bg-gray-50">
      <div
        className="mx-auto max-w-md px-4 pb-10"
        style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
      >
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo-labrigata.png" alt="" className="h-11 w-11" />
          <div>
            <h1 className="text-lg font-bold leading-tight text-gray-900">La Brigata</h1>
            <p className="text-sm text-gray-500">Verifica della tessera associativa</p>
          </div>
        </div>

        {stato === 'carico' && <Caricamento cosa="della tessera" />}

        {stato === 'non-trovata' && (
          <Vuoto
            icona={<ShieldX className="h-10 w-10" />}
            titolo="Tessera non riconosciuta"
            spiegazione="Questo QR non corrisponde a nessuna tessera della Brigata."
          />
        )}

        {stato === 'errore' && (
          <Vuoto titolo="Verifica non riuscita" spiegazione="Controlla la connessione e inquadra di nuovo il QR." />
        )}

        {stato === 'pronto' && dati && (
          <div className={`rounded-2xl border p-6 text-center ${ESITI[dati.stato].colori}`}>
            <div className="mx-auto mb-3 flex justify-center">{ESITI[dati.stato].icona}</div>
            <p className="text-xl font-bold">{ESITI[dati.stato].titolo(dati.anno)}</p>
            <p className="mt-4 text-2xl font-semibold text-gray-900">{dati.intestatario}</p>
            <p className="text-gray-600">
              {dati.categoria} · tessera n. {dati.numero}
            </p>
            {(dati.carica || dati.ruolo) && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {dati.carica && (
                  <span className="rounded-full bg-gray-900 px-3 py-1 text-sm font-semibold text-white">
                    {dati.carica} · Consiglio direttivo
                  </span>
                )}
                {dati.ruolo && (
                  <span className="rounded-full border border-gray-300 bg-white px-3 py-1 text-sm font-semibold text-gray-700">
                    {dati.ruolo}
                  </span>
                )}
              </div>
            )}
            <p className="mt-5 text-xs text-gray-500">
              Verificata il {format(quando, "d MMMM yyyy 'alle' HH:mm", { locale: it })}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

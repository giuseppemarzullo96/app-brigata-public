import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import toast from 'react-hot-toast'
import { Loader2, Wallet } from 'lucide-react'
import { api } from '../services/authService'

/**
 * La tessera associativa digitale, sul proprio profilo.
 *
 * Si vede qui nell'app e si aggiunge ad Apple Wallet o Google Wallet. Spetta
 * a chi e' in regola con la quota dell'anno: finche' non lo e', il riquadro
 * dice perche' manca invece di sparire, cosi' il socio sa cosa fare.
 */

type Tessera = {
  intestatario: string
  numero: string
  anno: number
  scadenza: string
  urlVerifica: string
  categoria: string
  carica: string | null
  ruolo: string | null
}

type Risposta = {
  anno: number
  stato: 'valida' | 'quota_non_pagata' | 'non_valida'
  tessera: Tessera | null
  wallet: { apple: boolean; google: boolean }
}

// Sui dispositivi Apple il pulsante Apple viene prima, altrove quello Google.
const suApple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)

export default function TesseraDigitale() {
  const { data, isLoading } = useQuery<Risposta>({
    queryKey: ['tessera'],
    queryFn: async () => (await api.get('/tessera')).data,
  })

  if (isLoading || !data) return null

  if (!data.tessera) {
    return (
      <div className="card">
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <Wallet className="w-5 h-5" /> Tessera {data.anno}
        </h3>
        <p className="text-sm text-gray-600 leading-relaxed">
          {data.stato === 'quota_non_pagata'
            ? `La tessera digitale arriva appena la quota ${data.anno} risulta pagata. Puoi pagarla dalla sezione Quote associative.`
            : 'La tessera non è disponibile per questo account.'}
        </p>
      </div>
    )
  }

  const pulsanti = [
    data.wallet.apple && <PulsanteWallet key="apple" dove="apple" etichetta="Aggiungi a Apple Wallet" />,
    data.wallet.google && <PulsanteWallet key="google" dove="google" etichetta="Aggiungi a Google Wallet" />,
  ].filter(Boolean)

  return (
    <div className="card">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Wallet className="w-5 h-5" /> Tessera {data.anno}
      </h3>
      <Carta tessera={data.tessera} />
      {pulsanti.length > 0 ? (
        <div className="mt-4 space-y-2">{suApple ? pulsanti : [...pulsanti].reverse()}</div>
      ) : (
        <p className="mt-3 text-sm text-gray-500 leading-relaxed">
          Presto potrai aggiungerla al wallet del telefono. Intanto puoi mostrarla da qui.
        </p>
      )}
    </div>
  )
}

function Campo({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#F6E924]">{etichetta}</p>
      <p className="font-semibold truncate">{valore}</p>
    </div>
  )
}

/** La tessera com'e' nel wallet: fondo asfalto, etichette gialle, QR. */
function Carta({ tessera }: { tessera: Tessera }) {
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    QRCode.toDataURL(tessera.urlVerifica, { margin: 1, width: 360, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(null))
  }, [tessera.urlVerifica])

  return (
    <div className="rounded-2xl bg-[#121212] p-4 text-white shadow-sm">
      <img src="/wallet/marchio.svg" alt="La Brigata, unità di strada" className="h-9" />
      <div className="mt-4">
        <Campo etichetta={tessera.categoria} valore={tessera.intestatario} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Campo etichetta="Tessera n." valore={tessera.numero} />
        <Campo etichetta="Anno" valore={String(tessera.anno)} />
        <Campo etichetta="Scadenza" valore={tessera.scadenza} />
      </div>
      {(tessera.carica || tessera.ruolo) && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {tessera.carica && <Campo etichetta="Consiglio direttivo" valore={tessera.carica} />}
          {tessera.ruolo && <Campo etichetta="Ruolo" valore={tessera.ruolo} />}
        </div>
      )}
      {qr && (
        <div className="mt-4 flex flex-col items-center">
          <img src={qr} alt={`QR della tessera n. ${tessera.numero}`} className="h-36 w-36 rounded-lg bg-white" />
          <p className="mt-1 text-xs text-gray-300">N. {tessera.numero}</p>
        </div>
      )}
    </div>
  )
}

/**
 * Apre il link del wallet. Il link si chiede al momento: quello Apple dura
 * pochi minuti. Si naviga invece di scaricare: Safari propone "Aggiungi"
 * solo cosi', e nell'app installata un indirizzo esterno si apre nel browser
 * del telefono, che passa la tessera al wallet.
 */
function PulsanteWallet({ dove, etichetta }: { dove: 'apple' | 'google'; etichetta: string }) {
  const [attesa, setAttesa] = useState(false)

  const apri = async () => {
    setAttesa(true)
    try {
      const { data } = await api.get(`/tessera/${dove}`)
      window.location.href = data.url
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Non è stato possibile preparare la tessera')
    } finally {
      setAttesa(false)
    }
  }

  return (
    <button
      type="button"
      onClick={apri}
      disabled={attesa}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
    >
      {attesa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
      {etichetta}
    </button>
  )
}

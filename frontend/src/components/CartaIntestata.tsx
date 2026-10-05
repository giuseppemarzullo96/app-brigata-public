import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, FileText, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../services/authService'

/**
 * Carta intestata di verbali e convocazioni: intestazione e piè di pagina in
 * HTML semplice, piu' il logo. Il server li disegna su ogni pagina dei PDF.
 */

// Il modello di partenza: la carta intestata dell'associazione.
const MODELLO_INTESTAZIONE = `<table align="center">
  <tr>
    <td width="82"><img src="logo" height="74"></td>
    <td width="215">
      <p align="center"><b><span size="13">LA BRIGATA</span></b><br>
      <b><span size="10.5">UNITÀ DI STRADA - SALERNO</span></b><br>
      <b><span size="10">ODV</span></b></p>
      <hr>
      <p align="center" size="6.5" color="#333333">C.F. 95191420652 - labrigatasalerno@pec.it</p>
    </td>
  </tr>
</table>`

const MODELLO_PIEPAGINA = `<p align="center" size="9">“La Brigata - Unità di Strada” ODV<br>
Via Dionisio Martino, 6, 84131, Salerno<br>
<u><span color="#1155cc">labrigatasalerno@pec.it</span></u> | <u><span color="#1155cc">www.labrigataodv.it</span></u> | labrigatasalerno@gmail.com<br>
C.F. 95191420652</p>`

const valore = (data: any, chiave: string) =>
  data?.impostazioni?.find((i: any) => i.chiave === chiave)?.valore ?? ''

const CartaIntestata = () => {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [intestazione, setIntestazione] = useState('')
  const [piepagina, setPiepagina] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ['impostazioni'],
    queryFn: async () => (await api.get('/impostazioni')).data,
  })
  const percorsoLogo = valore(data, 'carta_intestata_logo')

  useEffect(() => {
    if (!data) return
    setIntestazione(valore(data, 'carta_intestata_intestazione'))
    setPiepagina(valore(data, 'carta_intestata_piepagina'))
  }, [data])

  // Il logo passa dall'API (serve il login): lo si scarica come blob per mostrarlo.
  useEffect(() => {
    let url: string | null = null
    if (!percorsoLogo) { setLogoUrl(null); return }
    api.get('/impostazioni/carta-intestata/logo', { responseType: 'blob' })
      .then((r) => { url = URL.createObjectURL(r.data); setLogoUrl(url) })
      .catch(() => setLogoUrl(null))
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [percorsoLogo])

  const errore = (e: any) => toast.error(e.response?.data?.error || 'Operazione non riuscita')
  const invalida = () => queryClient.invalidateQueries({ queryKey: ['impostazioni'] })

  const salva = useMutation({
    mutationFn: async () => {
      await api.put('/impostazioni/carta_intestata_intestazione', { valore: intestazione })
      await api.put('/impostazioni/carta_intestata_piepagina', { valore: piepagina })
    },
    onSuccess: () => { invalida(); toast.success('Carta intestata salvata') },
    onError: errore,
  })

  const caricaLogo = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('logo_carta', file)
      return (await api.post('/impostazioni/carta-intestata/logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })).data
    },
    onSuccess: () => { invalida(); toast.success('Logo caricato') },
    onError: errore,
    onSettled: () => { if (fileRef.current) fileRef.current.value = '' },
  })

  const rimuoviLogo = useMutation({
    mutationFn: async () => api.put('/impostazioni/carta_intestata_logo', { valore: '' }),
    onSuccess: () => { invalida(); toast.success('Logo rimosso') },
    onError: errore,
  })

  const anteprima = async () => {
    // La finestra si apre subito, al clic: aperta dopo l'attesa, i browser la bloccano.
    const finestra = window.open('', '_blank')
    try {
      const r = await api.post('/impostazioni/carta-intestata/anteprima',
        { intestazione, piepagina }, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }))
      if (finestra) finestra.location.href = url
      else window.location.href = url
    } catch (e) {
      finestra?.close()
      errore(e)
    }
  }

  const modificato = data && (
    intestazione !== valore(data, 'carta_intestata_intestazione')
    || piepagina !== valore(data, 'carta_intestata_piepagina'))

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="h-5 w-5 text-gray-500" aria-hidden="true" />
        <h2 className="text-base font-semibold text-gray-900">Carta intestata</h2>
      </div>
      <p className="text-sm leading-relaxed text-gray-500">
        Intestazione e piè di pagina di verbali e convocazioni, ripetuti su ogni pagina. Se lasci
        vuota l'intestazione, i PDF usano quella predefinita.
      </p>

      <details className="mt-3 text-xs text-gray-600">
        <summary className="cursor-pointer font-medium text-gray-700">Tag che puoi usare</summary>
        <ul className="mt-2 space-y-1 font-mono">
          <li>&lt;p align="center" size="9" color="#666"&gt;…&lt;/p&gt; — paragrafo</li>
          <li>&lt;b&gt; &lt;i&gt; &lt;u&gt; — grassetto, corsivo, sottolineato</li>
          <li>&lt;span size="8" color="#1155cc"&gt; — dimensione e colore</li>
          <li>&lt;br&gt; a capo · &lt;hr&gt; linea</li>
          <li>&lt;img src="logo" height="60"&gt; — il logo caricato qui sotto</li>
          <li>&lt;table&gt;&lt;tr&gt;&lt;td width="80"&gt;…&lt;/td&gt;&lt;td&gt;…&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt; — affiancati</li>
          <li>{'{pagina}'} — numero della pagina</li>
        </ul>
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {logoUrl ? <img src={logoUrl} alt="Logo" className="max-h-full max-w-full" /> : (
            <span className="text-xs text-gray-400">nessun logo</span>
          )}
        </div>
        <label className="flex min-h-[44px] cursor-pointer items-center rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          <Upload className="mr-2 h-4 w-4" />
          {caricaLogo.isPending ? 'Caricamento…' : percorsoLogo ? 'Cambia logo' : 'Carica logo'}
          <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) caricaLogo.mutate(f) }} />
        </label>
        {percorsoLogo && (
          <button type="button" className="text-sm text-red-600 underline" onClick={() => rimuoviLogo.mutate()}>
            Rimuovi logo
          </button>
        )}
        <span className="text-xs text-gray-500">PNG o JPEG, massimo 2 MB</span>
      </div>

      <label className="mt-4 block text-sm font-medium text-gray-700">Intestazione</label>
      <textarea className="input mt-1 w-full font-mono text-xs" rows={10} value={intestazione}
        onChange={(e) => setIntestazione(e.target.value)} />
      <label className="mt-3 block text-sm font-medium text-gray-700">Piè di pagina</label>
      <textarea className="input mt-1 w-full font-mono text-xs" rows={5} value={piepagina}
        onChange={(e) => setPiepagina(e.target.value)} />

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => salva.mutate()} disabled={!modificato || salva.isPending}
          className="flex min-h-[44px] items-center rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50">
          {salva.isPending ? 'Salvataggio…' : 'Salva'}
        </button>
        <button type="button" onClick={anteprima}
          className="flex min-h-[44px] items-center rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          <Eye className="mr-2 h-4 w-4" />
          Anteprima PDF
        </button>
        <button type="button"
          onClick={() => {
            if ((!intestazione && !piepagina) || confirm('Sostituire il testo attuale con il modello della carta intestata?')) {
              setIntestazione(MODELLO_INTESTAZIONE)
              setPiepagina(MODELLO_PIEPAGINA)
            }
          }}
          className="flex min-h-[44px] items-center rounded-xl border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          Usa il modello
        </button>
      </div>
      <p className="mt-2 text-xs text-gray-500">L'anteprima usa il testo scritto qui, anche se non l'hai ancora salvato.</p>
    </section>
  )
}

export default CartaIntestata

import { useQuery } from '@tanstack/react-query'
import { api } from '../services/authService'
import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Download, Instagram } from 'lucide-react'
import toast from 'react-hot-toast'
import { Caricamento, IntestazionePagina, Pagina, Vuoto } from '../components/ui'

interface SlotLibero {
  slot_id: string
  tipo_slot: string
  numero_porzioni: number | null
  turno_id: string
  data_turno: string
  tipo_turno: string
  nome_ricetta: string | null
  note_alimentari: string | null
}

interface GruppoStoria {
  key: string
  turno_id: string
  data_turno: string
  tipo_slot: string
  nome_ricetta: string | null
  note_alimentari: string | null
  slots: { numero_porzioni: number | null }[]
}

const CATEGORIA_INFO: Record<string, { headlineWord: string; label: string; emoji: string; accent: string; bg: string }> = {
  primi: { headlineWord: 'FORNELLI', label: 'PRIMI', emoji: '🍝', accent: '#d9663f', bg: '#b7d6c4' },
  secondi: { headlineWord: 'FORNELLI', label: 'SECONDI', emoji: '🍗', accent: '#d9663f', bg: '#b7d6c4' },
  contorni: { headlineWord: 'FORNELLI', label: 'CONTORNI', emoji: '🥗', accent: '#d9663f', bg: '#b7d6c4' },
  pane: { headlineWord: 'PANE', label: 'PANE', emoji: '🍞', accent: '#b8752c', bg: '#e6d5a8' },
  dolci: { headlineWord: 'DOLCI', label: 'DOLCI', emoji: '🍰', accent: '#c94f80', bg: '#f0c9d9' },
  acqua: { headlineWord: 'ACQUA', label: 'BEVANDE', emoji: '💧', accent: '#2b7fb0', bg: '#b9dbe8' },
  frutta: { headlineWord: 'FRUTTA', label: 'FRUTTA', emoji: '🍎', accent: '#4f8f3a', bg: '#d3e6ab' },
  altro: { headlineWord: 'AIUTO', label: 'ALTRO', emoji: '🤝', accent: '#6f5fa8', bg: '#d6cce8' },
}

// Dimensiona il titolo in base alla lunghezza della parola così non esce mai dal riquadro
const headlineFontSize = (word: string) => {
  if (word.length <= 5) return 58
  if (word.length <= 7) return 46
  if (word.length <= 9) return 38
  return 30
}

const formatData = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()
}

const StoryCard = ({ gruppo }: { gruppo: GruppoStoria }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const info = CATEGORIA_INFO[gruppo.tipo_slot] || CATEGORIA_INFO.altro

  const handleDownload = async () => {
    if (!ref.current) return
    setDownloading(true)
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 3, cacheBust: true })
      const link = document.createElement('a')
      link.download = `storia-${info.label.toLowerCase()}-${gruppo.data_turno}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      toast.error('Errore durante la generazione dell\'immagine')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={ref}
        style={{
          width: 360,
          height: 640,
          position: 'relative',
          overflow: 'hidden',
          background: info.bg,
          fontFamily: "'Arial Rounded MT Bold', Arial, sans-serif",
        }}
      >
        {/* Decorazioni ad arco */}
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={`tl-${i}`}
            style={{
              position: 'absolute',
              top: -60 - i * 34,
              left: -60 - i * 34,
              width: 120 + i * 68,
              height: 120 + i * 68,
              borderRadius: '50%',
              border: `10px solid ${info.accent}`,
              opacity: 0.9,
            }}
          />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <div
            key={`bl-${i}`}
            style={{
              position: 'absolute',
              bottom: -50 - i * 34,
              left: -50 - i * 34,
              width: 100 + i * 68,
              height: 100 + i * 68,
              borderRadius: '50%',
              border: `10px solid ${info.accent}`,
              opacity: 0.9,
            }}
          />
        ))}

        {/* Badge Cucine Solidali */}
        <div
          style={{
            position: 'absolute', top: 20, left: 20,
            background: '#f5f518', color: '#111', fontWeight: 900,
            fontSize: 13, padding: '6px 12px', borderRadius: 8,
            letterSpacing: 0.5, zIndex: 5,
          }}
        >
          CUCINE SOLIDALI
        </div>

        {/* Logo */}
        <img
          src="/logo-labrigata.png"
          alt=""
          style={{ position: 'absolute', top: 16, right: 16, width: 44, height: 44, zIndex: 5 }}
        />

        {/* Titolo */}
        <div style={{ position: 'absolute', top: 78, left: 20, right: 20, zIndex: 5 }}>
          <div style={{
            fontSize: 30, fontWeight: 900, color: '#fff',
            textShadow: '3px 3px 0 #263654', lineHeight: 1,
          }}>
            S.O.S.
          </div>
          <div style={{
            fontSize: headlineFontSize(info.headlineWord), fontWeight: 900, color: '#f5f518',
            textShadow: `4px 4px 0 ${info.accent}`, lineHeight: 1, marginTop: 4,
            wordBreak: 'break-word', maxWidth: 320,
          }}>
            {info.headlineWord}
          </div>
          <div style={{
            fontSize: 13, fontWeight: 800, color: '#fff', marginTop: 12,
            textShadow: '1px 1px 0 #263654', lineHeight: 1.3,
          }}>
            AIUTACI NELLA PREPARAZIONE DEI PASTI<br />DA DISTRIBUIRE IN STRADA
          </div>
        </div>

        {/* Badge data */}
        <div style={{
          position: 'absolute', top: 235, left: 20, zIndex: 6,
          background: '#f5f518', width: 100, height: 100, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: 'rotate(-8deg)', textAlign: 'center',
          boxShadow: `0 0 0 6px ${info.bg}, 0 0 0 8px #f5f518`,
        }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: info.accent, lineHeight: 1.15 }}>
            PER<br />{formatData(gruppo.data_turno)}
          </span>
        </div>

        {/* Mockup telefono */}
        <div style={{
          position: 'absolute', top: 278, left: 50, right: 20, bottom: 66,
          background: '#111', borderRadius: 36, padding: 8,
          transform: 'rotate(4deg)', zIndex: 4,
          boxShadow: '0 12px 24px rgba(0,0,0,0.25)',
        }}>
          <div style={{
            background: '#fff', borderRadius: 28, width: '100%', height: '100%',
            padding: '14px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', overflow: 'hidden',
          }}>
            <div style={{
              width: gruppo.slots.length > 2 ? 56 : 72, height: gruppo.slots.length > 2 ? 56 : 72,
              borderRadius: '50%', background: '#f3ecd8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: gruppo.slots.length > 2 ? 30 : 38, marginBottom: 6, flexShrink: 0,
            }}>
              {info.emoji}
            </div>
            <div style={{
              fontSize: info.label.length > 10 ? 15 : 18, fontWeight: 900, color: info.accent,
              letterSpacing: 0.5, textAlign: 'center', maxWidth: '100%', flexShrink: 0,
            }}>
              {info.label}
            </div>
            {gruppo.nome_ricetta && (
              <div style={{ fontSize: 13, fontWeight: 700, color: info.accent, textAlign: 'center', marginTop: 3, flexShrink: 0 }}>
                {gruppo.nome_ricetta}
                {gruppo.note_alimentari && (
                  <span style={{ display: 'block', fontSize: 9, color: '#374151', fontWeight: 600, marginTop: 2 }}>
                    {gruppo.note_alimentari}
                  </span>
                )}
              </div>
            )}
            <div style={{ marginTop: 8, width: '100%', flexShrink: 0 }}>
              {gruppo.slots.map((s, i) => (
                <div key={i} style={{ fontSize: gruppo.slots.length > 2 ? 12 : 14, color: '#111', fontWeight: 600, textAlign: 'center', marginTop: 3, lineHeight: 1.2 }}>
                  {i + 1}° slot{s.numero_porzioni ? `: ${s.numero_porzioni} porzioni` : ''}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Banner CTA */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: '#f5f518', padding: '14px 16px', textAlign: 'center', zIndex: 5,
        }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: '#111' }}>
            SE TI VA DI AIUTARCI, COMMENTA QUESTA STORIA!
          </span>
        </div>
      </div>

      <button
        onClick={handleDownload}
        disabled={downloading}
        className="btn btn-primary flex items-center gap-2 text-sm"
      >
        <Download className="w-4 h-4" />
        {downloading ? 'Generazione...' : 'Scarica storia'}
      </button>
    </div>
  )
}

const StorieInstagram = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['turni', 'slot-liberi'],
    queryFn: async () => {
      const response = await api.get('/turni/slot-liberi', { params: { limitTurni: 8 } })
      return response.data
    },
  })

  const slot: SlotLibero[] = data?.slot || []

  // Raggruppa per turno + tipo_slot + ricetta (stessi slot dello stesso tipo condividono la stessa storia)
  const gruppiMap = new Map<string, GruppoStoria>()
  slot.forEach((s) => {
    const key = `${s.turno_id}-${s.tipo_slot}-${s.nome_ricetta || ''}`
    if (!gruppiMap.has(key)) {
      gruppiMap.set(key, {
        key,
        turno_id: s.turno_id,
        data_turno: s.data_turno,
        tipo_slot: s.tipo_slot,
        nome_ricetta: s.nome_ricetta,
        note_alimentari: s.note_alimentari,
        slots: [],
      })
    }
    gruppiMap.get(key)!.slots.push({ numero_porzioni: s.numero_porzioni })
  })
  const gruppi = Array.from(gruppiMap.values())

  return (
    <Pagina>
      <IntestazionePagina
        titolo="Storie Instagram"
        sottotitolo="Scarica un’immagine per ogni portata ancora scoperta e pubblicala"
      />

      {isLoading ? (
        <Caricamento cosa="degli slot scoperti" />
      ) : gruppi.length === 0 ? (
        <Vuoto
          icona={<Instagram className="mx-auto h-12 w-12" aria-hidden="true" />}
          titolo="Niente da chiedere"
          spiegazione="Tutti i posti dei prossimi turni sono coperti."
        />
      ) : (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          {gruppi.map((gruppo) => (
            <StoryCard key={gruppo.key} gruppo={gruppo} />
          ))}
        </div>
      )}
    </Pagina>
  )
}

export default StorieInstagram

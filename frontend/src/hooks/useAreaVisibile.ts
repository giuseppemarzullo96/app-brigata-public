import { useEffect, useState } from 'react'

/**
 * Quanto spazio lascia davvero la tastiera.
 *
 * Su iPhone la tastiera non accorcia `100vh` né `100dvh`: quello che è alto
 * «tutto lo schermo» resta alto come prima, finisce sotto la tastiera e il
 * campo in cui si scrive sparisce. `visualViewport` invece dice l'area
 * visibile; chi la usa si mette lì dentro.
 */
export function useAreaVisibile(attivo: boolean) {
  const [area, setArea] = useState<{ altezza: number; alto: number } | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!attivo || !vv) {
      setArea(null)
      return
    }
    const aggiorna = () => setArea({ altezza: vv.height, alto: vv.offsetTop })
    aggiorna()
    vv.addEventListener('resize', aggiorna)
    vv.addEventListener('scroll', aggiorna)
    return () => {
      vv.removeEventListener('resize', aggiorna)
      vv.removeEventListener('scroll', aggiorna)
    }
  }, [attivo])
  return area
}

/** Blocca lo scorrimento della pagina sotto finché `attivo` è vero. */
export function useBloccaScorrimento(attivo: boolean) {
  useEffect(() => {
    if (!attivo) return
    const prima = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prima
    }
  }, [attivo])
}

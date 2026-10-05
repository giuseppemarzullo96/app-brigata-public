import { useEffect, useState } from 'react'

/**
 * Il valore, ma solo dopo che ha smesso di cambiare per `ms` millisecondi.
 *
 * Serve ai campi di ricerca che interrogano il server: senza, ogni lettera
 * digitata partiva come una richiesta a se'.
 */
export function useRitardato<T>(valore: T, ms = 300): T {
  const [ritardato, setRitardato] = useState(valore)
  useEffect(() => {
    const t = setTimeout(() => setRitardato(valore), ms)
    return () => clearTimeout(t)
  }, [valore, ms])
  return ritardato
}

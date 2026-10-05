/**
 * Registrazione delle pagine viste, con gli indirizzi ripuliti.
 *
 * Umami è configurato con auto-track disattivato: se registrasse da solo gli
 * URL, finirebbe per scrivere nelle statistiche cose come
 * /soci/9b96768c-… — cioè l'identificativo del socio che sta guardando il
 * proprio profilo. Qui gli identificativi vengono sostituiti con :id prima
 * dell'invio, così resta l'informazione utile (quale sezione è frequentata)
 * senza quella personale (chi la sta guardando).
 */

type DatiUmami = Record<string, unknown>

declare global {
  interface Window {
    umami?: { track: (dati: (base: DatiUmami) => DatiUmami) => void }
  }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** Sostituisce gli identificativi nel percorso e scarta la query string. */
export function mascheraPercorso(percorso: string): string {
  return percorso
    .split('?')[0]
    // Il codice del calendario pubblico e' la chiave di accesso: non va nelle statistiche.
    .replace(/^\/calendario\/[^/]+/, '/calendario/:codice')
    .replace(UUID, ':id')
}

/**
 * Registra una pagina vista. Senza lo script caricato non fa nulla.
 *
 * ATTENZIONE alla forma della chiamata: passando un oggetto, Umami lo usa
 * COME payload completo e butta via il proprio, identificativo del sito
 * compreso; il server risponde 400 e l'evento si perde in silenzio.
 * Passando invece una funzione, Umami le consegna il payload gia' pronto
 * (sito, dominio, schermo, lingua, referrer) e noi cambiamo solo l'url.
 */
export function registraPagina(percorso: string) {
  if (!window.umami) return
  try {
    window.umami.track((base) => ({ ...base, url: mascheraPercorso(percorso) }))
  } catch {
    // Le statistiche non devono mai interrompere l'uso dell'app.
  }
}

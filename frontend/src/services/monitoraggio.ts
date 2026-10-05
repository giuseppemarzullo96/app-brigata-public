import * as Sentry from '@sentry/react'

/**
 * Raccolta degli errori del browser.
 *
 * Si attiva solo se VITE_SENTRY_DSN è valorizzata al momento della build:
 * senza, non viene caricato né inviato nulla.
 *
 * Verso il raccoglitore non devono mai uscire dati personali dei soci né
 * informazioni sul voto: il payload viene ripulito prima dell'invio.
 */

const DA_RIMUOVERE = [
  'password', 'currentpassword', 'newpassword', 'nuova_email',
  'candidati', 'scheda_bianca',
  'email', 'telefono', 'codice_fiscale', 'indirizzo', 'note',
  'token', 'authorization',
]

function ripulisci(valore: unknown): unknown {
  if (!valore || typeof valore !== 'object') return valore
  if (Array.isArray(valore)) return valore.map(ripulisci)

  const copia: Record<string, unknown> = { ...(valore as Record<string, unknown>) }
  for (const chiave of Object.keys(copia)) {
    if (DA_RIMUOVERE.includes(chiave.toLowerCase())) copia[chiave] = '[rimosso]'
    else copia[chiave] = ripulisci(copia[chiave])
  }
  return copia
}

/** Toglie dall'indirizzo gli identificativi, che non servono a diagnosticare. */
function anonimizzaUrl(url: string): string {
  return url.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
}

export function inizializzaMonitoraggio() {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return false

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    // Nessuna registrazione delle sessioni: mostrerebbe i dati dei soci
    // e, durante un'elezione, la scheda di voto mentre viene compilata.
    integrations: [],
    tracesSampleRate: 0,
    beforeSend(evento) {
      if (evento.request?.url) evento.request.url = anonimizzaUrl(evento.request.url)
      if (evento.request?.data) evento.request.data = ripulisci(evento.request.data) as any
      delete evento.request?.cookies
      delete evento.request?.headers
      if (evento.user) evento.user = { id: evento.user.id }
      return evento
    },
    beforeBreadcrumb(traccia) {
      // Le briciole di navigazione contengono gli URL visitati e i valori
      // digitati nei campi: si tengono solo quelle utili, ripulite.
      if (traccia.category === 'ui.input') return null
      if (traccia.data?.url) traccia.data.url = anonimizzaUrl(String(traccia.data.url))
      return traccia
    },
  })

  return true
}

/** Associa all'errore il solo id dell'utente, mai nome o email. */
export function identificaUtente(id?: string) {
  if (!import.meta.env.VITE_SENTRY_DSN) return
  Sentry.setUser(id ? { id } : null)
}

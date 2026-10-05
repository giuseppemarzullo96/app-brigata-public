/**
 * Il messaggio per l'admin dopo l'invio dei dati di accesso a un socio:
 * dice per quali canali e' partito davvero, perche' se non e' arrivato
 * niente bisogna dirglielo a voce.
 */
export function esitoInvioCredenziali(inviati: { email: boolean; whatsapp: boolean } | null | undefined) {
  if (!inviati) return null
  const canali = [inviati.email && 'email', inviati.whatsapp && 'WhatsApp'].filter(Boolean)
  if (canali.length === 0) {
    return { ok: false, testo: 'Dati di accesso non inviati: né email né WhatsApp sono partiti. Controlla email e telefono del socio.' }
  }
  return { ok: true, testo: `Dati di accesso inviati per ${canali.join(' e ')}` }
}

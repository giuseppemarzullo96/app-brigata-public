/**
 * Logica di scrutinio per le votazioni degli organi sociali.
 *
 * Funzione pura e priva di dipendenze: riceve i conteggi grezzi e restituisce
 * la graduatoria, gli eletti e l'eventuale ballottaggio. Tenerla separata dal
 * controller permette di verificarla senza database.
 */

/**
 * Ordina i candidati per voti decrescenti; a parita' di voti, ordine alfabetico
 * per cognome e nome, cosi' la graduatoria e' stabile e riproducibile (il
 * verbale non deve cambiare ordine fra due esecuzioni).
 */
function ordinaGraduatoria(candidati) {
  return [...candidati].sort((a, b) => {
    if (b.voti !== a.voti) return b.voti - a.voti;
    const cognome = (a.cognome || '').localeCompare(b.cognome || '', 'it');
    if (cognome !== 0) return cognome;
    return (a.nome || '').localeCompare(b.nome || '', 'it');
  });
}

/**
 * Calcola l'esito di una votazione.
 *
 * @param {object} params
 * @param {number} params.seggi            Membri da eleggere.
 * @param {Array}  params.candidati        [{ id, nome, cognome, ritirato }]
 * @param {object} params.conteggi         Mappa candidato_id -> numero preferenze.
 * @param {number} params.aventiDiritto    Totale elettori nello snapshot.
 * @param {number} params.votanti          Elettori che hanno deposto una scheda.
 * @param {number} params.schedeBianche    Schede bianche.
 * @returns {object} esito dello scrutinio
 */
function calcolaRisultati({
  seggi,
  candidati = [],
  conteggi = {},
  aventiDiritto = 0,
  votanti = 0,
  schedeBianche = 0,
}) {
  const ammessi = candidati
    .filter((c) => !c.ritirato)
    .map((c) => ({
      id: c.id,
      nome: c.nome,
      cognome: c.cognome,
      user_id: c.user_id ?? null,
      voti: Number(conteggi[c.id] || 0),
    }));

  const graduatoria = ordinaGraduatoria(ammessi);

  // Un candidato senza alcuna preferenza non puo' occupare un seggio, anche se
  // i seggi disponibili sono piu' numerosi dei candidati votati.
  const votati = graduatoria.filter((c) => c.voti > 0);

  let eletti = [];
  let ballottaggio = [];
  let ballottaggioNecessario = false;
  let seggiDaAssegnareAlBallottaggio = 0;

  if (votati.length <= seggi) {
    eletti = votati;
  } else {
    const sogliaUltimoSeggio = votati[seggi - 1].voti;
    const elettiDiretti = votati.filter((c) => c.voti > sogliaUltimoSeggio);
    const aPariMerito = votati.filter((c) => c.voti === sogliaUltimoSeggio);
    const seggiRimanenti = seggi - elettiDiretti.length;

    if (aPariMerito.length === seggiRimanenti) {
      // La parita' non tocca il confine: tutti i pari merito entrano.
      eletti = [...elettiDiretti, ...aPariMerito];
    } else {
      // Piu' candidati a pari merito che seggi residui: il sistema non sceglie.
      eletti = elettiDiretti;
      ballottaggio = aPariMerito;
      ballottaggioNecessario = true;
      seggiDaAssegnareAlBallottaggio = seggiRimanenti;
    }
  }

  const idEletti = new Set(eletti.map((c) => c.id));
  const idBallottaggio = new Set(ballottaggio.map((c) => c.id));

  const risultati = graduatoria.map((c, i) => ({
    ...c,
    posizione: i + 1,
    eletto: idEletti.has(c.id),
    ballottaggio: idBallottaggio.has(c.id),
    // Quota di elettori che ha dato una preferenza a questo candidato.
    percentuale_votanti: votanti > 0 ? Math.round((c.voti / votanti) * 1000) / 10 : 0,
  }));

  const preferenzeEspresse = ammessi.reduce((tot, c) => tot + c.voti, 0);

  return {
    seggi_da_eleggere: seggi,
    aventi_diritto: aventiDiritto,
    votanti,
    non_votanti: Math.max(aventiDiritto - votanti, 0),
    affluenza_percentuale:
      aventiDiritto > 0 ? Math.round((votanti / aventiDiritto) * 1000) / 10 : 0,
    schede_bianche: schedeBianche,
    schede_valide: Math.max(votanti - schedeBianche, 0),
    preferenze_espresse: preferenzeEspresse,
    risultati,
    eletti,
    seggi_assegnati: eletti.length,
    seggi_scoperti: Math.max(seggi - eletti.length - seggiDaAssegnareAlBallottaggio, 0),
    ballottaggio_necessario: ballottaggioNecessario,
    candidati_ballottaggio: ballottaggio,
    seggi_al_ballottaggio: seggiDaAssegnareAlBallottaggio,
  };
}

module.exports = { calcolaRisultati, ordinaGraduatoria };

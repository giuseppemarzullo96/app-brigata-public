#!/usr/bin/env node
/**
 * Report settimanale sullo stato dell'associazione, ricavato dai dati dell'app.
 *
 * Risponde alle domande che servono davvero a capire se l'app sta funzionando:
 * chi e' entrato e chi no, se i turni si riempiono da soli, se le quote si
 * muovono, se le assemblee raccolgono conferme. Nessuno strumento esterno e
 * nessun dato che esca dal server.
 *
 * Uso:
 *   node report-settimanale.js            invia il report su WhatsApp
 *   node report-settimanale.js --prova    lo stampa soltanto, senza inviare
 */
const { Client } = require(require('path').join(__dirname, '../backend/node_modules/pg'));
const { execFileSync } = require('child_process');

const SOLO_PROVA = process.argv.includes('--prova');
// Numero a cui recapitare il report. Piu' destinatari: separare con virgola.
const DESTINATARI = (process.env.REPORT_DESTINATARI || '393330000000').split(',');

function config(contenitore, chiave) {
  const env = execFileSync('docker', ['inspect', contenitore,
    '--format', '{{range .Config.Env}}{{println .}}{{end}}']).toString();
  return (env.match(new RegExp(`${chiave}=(.*)`)) || [])[1];
}

function connessione() {
  const host = execFileSync('docker', ['inspect', 'app-brigata-postgres',
    '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}'])
    .toString().trim().split(/\s+/)[0];
  return {
    host, port: 5432, user: 'app_brigata', database: 'app_brigata',
    password: config('app-brigata-postgres', 'POSTGRES_PASSWORD'),
  };
}

const uno = async (c, sql, par = []) => (await c.query(sql, par)).rows[0];
const tutti = async (c, sql, par = []) => (await c.query(sql, par)).rows;

/** Soci reali: esclude enti fittizi, archiviati e sospesi. */
const SOCI_ATTIVI = `
  FROM users
  WHERE attivo AND NOT archiviato AND NOT COALESCE(sospeso, false)
    AND NOT COALESCE(fittizio, false) AND ruolo <> 'esterno'`;

async function raccogli(c) {
  const anno = new Date().getFullYear();

  const soci = await uno(c, `SELECT COUNT(*)::int AS totale ${SOCI_ATTIVI}`);

  // Adozione: chi ha fatto almeno un accesso, secondo il registro attivita'.
  const adozione = await uno(c, `
    SELECT COUNT(DISTINCT a.user_id)::int AS mai_entrati_no
      FROM audit_log a
      JOIN users u ON u.id = a.user_id
     WHERE a.azione = 'login_success'`);

  const settimana = await uno(c, `
    SELECT COUNT(DISTINCT user_id)::int AS attivi
      FROM audit_log
     WHERE azione = 'login_success' AND created_at > NOW() - INTERVAL '7 days'`);

  const maiEntrati = await tutti(c, `
    SELECT u.nome, COALESCE(u.cognome, '') AS cognome
      FROM users u
     WHERE u.attivo AND NOT u.archiviato AND NOT COALESCE(u.sospeso, false)
       AND NOT COALESCE(u.fittizio, false) AND u.ruolo <> 'esterno'
       AND NOT EXISTS (
         SELECT 1 FROM audit_log a
          WHERE a.user_id = u.id AND a.azione = 'login_success')
     ORDER BY u.nome`);

  // Turni: le prossime quattro settimane.
  const turni = await tutti(c, `
    SELECT t.data_turno,
           COUNT(s.id)::int AS totale,
           COUNT(*) FILTER (WHERE s.stato = 'assegnato')::int AS presi
      FROM turni_cucina t
      LEFT JOIN slot_turno s ON s.turno_id = t.id
     WHERE t.data_turno BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '28 days'
     GROUP BY t.data_turno
     ORDER BY t.data_turno`);

  const prenotazioni = await uno(c, `
    SELECT COUNT(*)::int AS nuove
      FROM audit_log
     WHERE azione = 'prenotazione_slot' AND created_at > NOW() - INTERVAL '7 days'`);

  // Quote dell'anno in corso.
  const quote = await uno(c, `
    SELECT COUNT(*)::int AS create,
           COUNT(*) FILTER (WHERE pagata)::int AS pagate,
           COUNT(*) FILTER (WHERE stato_validazione = 'in_attesa')::int AS da_validare,
           COALESCE(SUM(importo) FILTER (WHERE pagata), 0)::numeric AS incassato
      FROM quote_associative WHERE anno = $1`, [anno]);

  // Assemblee imminenti e conferme raccolte.
  const assemblee = await tutti(c, `
    SELECT a.titolo, a.data_assemblea,
           COUNT(*) FILTER (WHERE c.presenza IS TRUE)::int AS si,
           COUNT(*) FILTER (WHERE c.presenza IS FALSE)::int AS no,
           COUNT(*) FILTER (WHERE c.presenza IS NULL)::int AS senza_risposta
      FROM assemblee a
      LEFT JOIN convocazioni_assemblea c ON c.assemblea_id = a.id
     WHERE a.data_assemblea >= NOW()
     GROUP BY a.id, a.titolo, a.data_assemblea
     ORDER BY a.data_assemblea
     LIMIT 3`);

  const votazioni = await tutti(c, `
    SELECT v.titolo, v.stato,
           (SELECT COUNT(*)::int FROM aventi_diritto_votazione d WHERE d.votazione_id = v.id) AS aventi,
           (SELECT COUNT(*)::int FROM aventi_diritto_votazione d WHERE d.votazione_id = v.id AND d.ha_votato) AS votanti
      FROM votazioni v WHERE v.stato = 'aperta'`);

  const sondaggi = await tutti(c, `
    SELECT s.titolo,
           (SELECT COUNT(DISTINCT r.user_id)::int FROM risposte_sondaggio r WHERE r.sondaggio_id = s.id) AS risposte
      FROM sondaggi s WHERE s.stato = 'aperto'`);

  return {
    soci: soci.totale,
    entrati: adozione.mai_entrati_no,
    attiviSettimana: settimana.attivi,
    maiEntrati,
    turni,
    prenotazioni: prenotazioni.nuove,
    quote,
    assemblee,
    votazioni,
    sondaggi,
  };
}

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const data = (d) => `${new Date(d).getDate()} ${MESI[new Date(d).getMonth()]}`;
const perc = (parte, tot) => (tot > 0 ? Math.round((parte / tot) * 100) : 0);

function componi(m) {
  const r = [];
  r.push('📊 *La Brigata — report settimanale*');
  r.push('');

  r.push(`👥 *Soci nell'app:* ${m.soci}`);
  r.push(`Entrati almeno una volta: ${m.entrati} su ${m.soci} (${perc(m.entrati, m.soci)}%)`);
  r.push(`Attivi questa settimana: ${m.attiviSettimana}`);
  if (m.maiEntrati.length > 0) {
    const nomi = m.maiEntrati.map((u) => `${u.nome} ${u.cognome}`.trim());
    r.push(`Non hanno mai fatto accesso (${nomi.length}): ${nomi.slice(0, 12).join(', ')}${nomi.length > 12 ? '…' : ''}`);
  }
  r.push('');

  r.push('🍲 *Turni delle prossime 4 settimane*');
  if (m.turni.length === 0) {
    r.push('Nessun turno in calendario. Vanno creati.');
  } else {
    m.turni.forEach((t) => {
      const stato = t.totale === 0 ? 'nessuno slot'
        : `${t.presi}/${t.totale} (${perc(t.presi, t.totale)}%)`;
      const campanello = t.totale > 0 && perc(t.presi, t.totale) < 50 ? ' ⚠️' : '';
      r.push(`${data(t.data_turno)}: ${stato}${campanello}`);
    });
  }
  r.push(`Prenotazioni fatte dai soci questa settimana: ${m.prenotazioni}`);
  r.push('');

  r.push(`💳 *Quote ${new Date().getFullYear()}*`);
  r.push(`Pagate: ${m.quote.pagate} su ${m.quote.create} — incassato ${Number(m.quote.incassato).toFixed(2)}€`);
  if (m.quote.da_validare > 0) r.push(`⚠️ In attesa di validazione: ${m.quote.da_validare}`);
  r.push('');

  if (m.assemblee.length > 0) {
    r.push('📅 *Assemblee in arrivo*');
    m.assemblee.forEach((a) => {
      r.push(`${data(a.data_assemblea)} — ${a.titolo}`);
      r.push(`   presenti ${a.si} · assenti ${a.no} · senza risposta ${a.senza_risposta}`);
    });
    r.push('');
  }

  if (m.votazioni.length > 0) {
    r.push('🗳️ *Votazioni aperte*');
    m.votazioni.forEach((v) => {
      r.push(`${v.titolo}: ${v.votanti}/${v.aventi} (${perc(v.votanti, v.aventi)}%)`);
    });
    r.push('');
  }

  if (m.sondaggi.length > 0) {
    r.push('📊 *Sondaggi aperti*');
    m.sondaggi.forEach((s) => r.push(`${s.titolo}: ${s.risposte} risposte`));
    r.push('');
  }

  r.push('👉 ' + (process.env.APP_URL || 'https://tuo-dominio.example'));
  return r.join('\n');
}

async function invia(testo) {
  const apiKey = config('evolution-api', 'AUTHENTICATION_API_KEY');
  for (const numero of DESTINATARI) {
    const res = await fetch('http://127.0.0.1:8080/message/sendText/brigata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: numero.trim(), text: testo }),
    });
    console.log(`invio a ${numero}: ${res.status}`);
  }
}

(async () => {
  const c = new Client(connessione());
  await c.connect();
  try {
    const testo = componi(await raccogli(c));
    console.log(testo);
    if (!SOLO_PROVA) {
      console.log('\n---');
      await invia(testo);
    }
  } finally {
    await c.end();
  }
})();

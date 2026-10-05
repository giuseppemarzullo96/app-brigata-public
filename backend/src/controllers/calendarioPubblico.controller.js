const crypto = require('crypto');
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');
const { unitaPerTipo } = require('../utils/sondaggiTurno');

/**
 * Il calendario dei turni in sola lettura, per chi non ha un account.
 *
 * Si raggiunge con un link che porta un codice segreto: chi ha il link vede,
 * chi non ce l'ha no. Il codice sta nella tabella impostazioni ma FUORI
 * dall'elenco CHIAVI, che ogni socio puo' leggere: cosi' non compare mai in
 * GET /impostazioni. Cambiarlo rende inutile il link vecchio.
 *
 * Cosa si mostra: data, porzioni, pietanze, ricette e chi porta ogni posto
 * (nome e cognome, scelta dell'associazione). Cosa NON si mostra: telefoni,
 * email, identificativi, note dei turni e dei posti (le note dei posti
 * contengono lo storico dei sondaggi WhatsApp).
 */

const CHIAVE = 'calendario_pubblico_codice';
const ORDINE = ['primi', 'secondi', 'contorni', 'dolci', 'pane', 'acqua', 'frutta'];

async function codiceAttuale() {
  const [riga] = await sequelize.query('SELECT valore FROM impostazioni WHERE chiave = :c', {
    replacements: { c: CHIAVE }, type: QueryTypes.SELECT,
  });
  return riga?.valore || null;
}

/** Confronto a tempo costante, per non far indovinare il codice un carattere alla volta. */
function codiceValido(ricevuto, atteso) {
  if (!ricevuto || !atteso) return false;
  const a = Buffer.from(String(atteso));
  const b = Buffer.from(String(ricevuto));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** «2026-10» di adesso, all'ora italiana. */
function meseCorrente() {
  const parti = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date());
  return `${parti.find((p) => p.type === 'year').value}-${parti.find((p) => p.type === 'month').value}`;
}

const persona = (r) => r.ragione_sociale || `${r.nome || ''} ${r.cognome || ''}`.trim() || null;

/**
 * GET /api/v1/pubblico/calendario/:codice?mese=2026-10
 * Senza autenticazione: al posto della sessione c'e' il codice nel percorso.
 */
const getCalendario = async (req, res) => {
  try {
    if (!codiceValido(req.params.codice, await codiceAttuale())) {
      return res.status(404).json({ error: 'Calendario non trovato' });
    }

    const mese = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.mese || '') ? req.query.mese : meseCorrente();
    const inizio = `${mese}-01`;

    const righe = await sequelize.query(
      `SELECT t.id AS turno_id, to_char(t.data_turno, 'YYYY-MM-DD') AS data, t.tipo_turno, t.numero_porzioni,
              s.id AS slot_id, s.tipo_slot, s.numero_porzioni AS porzioni_slot, s.stato,
              r.nome_ricetta,
              u.nome, u.cognome, u.ragione_sociale
         FROM turni_cucina t
         LEFT JOIN slot_turno s ON s.turno_id = t.id
         LEFT JOIN ricettari r ON r.id = s.ricettario_id
         LEFT JOIN users u ON u.id = s.user_id AND s.stato <> 'libero'
        WHERE t.data_turno >= :inizio::date
          AND t.data_turno < (:inizio::date + INTERVAL '1 month')
        ORDER BY t.data_turno, t.tipo_turno, s.created_at, s.id`,
      { replacements: { inizio }, type: QueryTypes.SELECT }
    );

    const turni = [];
    const perTurno = new Map();
    for (const r of righe) {
      let turno = perTurno.get(r.turno_id);
      if (!turno) {
        turno = { data: r.data, tipo: r.tipo_turno, porzioni: r.numero_porzioni, portate: new Map() };
        perTurno.set(r.turno_id, turno);
        turni.push(turno);
      }
      if (!r.slot_id) continue;
      if (!turno.portate.has(r.tipo_slot)) turno.portate.set(r.tipo_slot, []);
      turno.portate.get(r.tipo_slot).push(r);
    }

    const risposta = turni.map((t) => {
      const portate = [...t.portate.entries()]
        .sort(([a], [b]) => {
          const ia = ORDINE.indexOf(a); const ib = ORDINE.indexOf(b);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        })
        .map(([tipo, slot]) => {
          const ricetta = slot.map((s) => s.nome_ricetta).find(Boolean) || null;
          const unita = unitaPerTipo(tipo, ricetta);
          return {
            tipo,
            ricetta,
            posti: slot.map((s) => ({
              quantita: s.porzioni_slot ? `${s.porzioni_slot} ${unita}` : null,
              persona: s.stato === 'libero' ? null : persona(s),
            })),
          };
        });
      const totale = portate.reduce((n, p) => n + p.posti.length, 0);
      const coperti = portate.reduce((n, p) => n + p.posti.filter((x) => x.persona).length, 0);
      return { data: t.data, tipo: t.tipo, porzioni: t.porzioni, totale, coperti, portate };
    });

    // Chi guarda il calendario non deve ricevere una versione vecchia da una cache.
    res.set('Cache-Control', 'no-store');
    res.json({ mese, turni: risposta });
  } catch (error) {
    logger.error('Errore calendario pubblico:', error);
    res.status(500).json({ error: 'Errore durante la lettura del calendario' });
  }
};

/** GET /api/v1/impostazioni/calendario-pubblico (admin) */
const getLink = async (req, res) => {
  try {
    const codice = await codiceAttuale();
    res.json({ attivo: !!codice, codice });
  } catch (error) {
    logger.error('Errore lettura link calendario pubblico:', error);
    res.status(500).json({ error: 'Errore durante la lettura del link' });
  }
};

/** POST /api/v1/impostazioni/calendario-pubblico (admin): crea o cambia il link. */
const rigeneraLink = async (req, res) => {
  try {
    const codice = crypto.randomBytes(18).toString('base64url');
    await sequelize.query(
      `INSERT INTO impostazioni (chiave, valore, descrizione, updated_by, updated_at)
       VALUES (:c, :v, 'Codice del link pubblico del calendario (non esposto in GET /impostazioni)', :u, CURRENT_TIMESTAMP)
       ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
      { replacements: { c: CHIAVE, v: codice, u: req.user.id }, type: QueryTypes.INSERT }
    );
    logger.info(`Link pubblico del calendario creato o cambiato da ${req.user.email}`);
    res.json({ attivo: true, codice });
  } catch (error) {
    logger.error('Errore creazione link calendario pubblico:', error);
    res.status(500).json({ error: 'Errore durante la creazione del link' });
  }
};

/** DELETE /api/v1/impostazioni/calendario-pubblico (admin): il link smette di funzionare. */
const disattivaLink = async (req, res) => {
  try {
    await sequelize.query('DELETE FROM impostazioni WHERE chiave = :c', {
      replacements: { c: CHIAVE }, type: QueryTypes.DELETE,
    });
    logger.info(`Link pubblico del calendario disattivato da ${req.user.email}`);
    res.json({ attivo: false, codice: null });
  } catch (error) {
    logger.error('Errore disattivazione link calendario pubblico:', error);
    res.status(500).json({ error: 'Errore durante la disattivazione del link' });
  }
};

module.exports = { getCalendario, getLink, rigeneraLink, disattivaLink };

const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');
const { filtroVisibilitaAssemblee } = require('../utils/direttivo');

/**
 * GET /api/v1/dashboard
 * Dashboard principale con statistiche base
 */
const getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const ruolo = req.user.ruolo;
    
    const stats = {};
    
    // Statistiche turni prossimi (per volontari)
    if (ruolo === 'admin' || ruolo === 'socio_volontario') {
      const [turniProssimi] = await sequelize.query(
        `SELECT COUNT(*) as count 
         FROM turni_cucina 
         WHERE data_turno >= CURRENT_DATE 
         AND data_turno <= CURRENT_DATE + INTERVAL '30 days'`,
        { type: sequelize.QueryTypes.SELECT }
      );
      
      const [slotAssegnati] = await sequelize.query(
        `SELECT COUNT(*) as count 
         FROM slot_turno s
         JOIN turni_cucina t ON s.turno_id = t.id
         WHERE s.user_id = :userId 
         AND t.data_turno >= CURRENT_DATE`,
        {
          replacements: { userId },
          type: QueryTypes.SELECT
        }
      );
      
      stats.turni_prossimi = parseInt(turniProssimi?.count || 0);
      stats.slot_assegnati = parseInt(slotAssegnati?.count || 0);
    }
    
    // Avvisi non letti (escludi quelli già letti dall'utente)
    const [avvisiNonLetti] = await sequelize.query(
      `SELECT COUNT(*) as count 
       FROM avvisi a
       WHERE a.pubblicato = true 
       AND (a.data_scadenza IS NULL OR a.data_scadenza >= CURRENT_TIMESTAMP)
       AND (
         a.destinatari IS NULL 
         OR a.destinatari::jsonb @> :categoriaJson::jsonb
         OR a.destinatari::jsonb @> '["tutti"]'::jsonb
         OR a.destinatari::jsonb @> :utenteJson::jsonb
       )
       AND NOT EXISTS (
         SELECT 1 FROM avvisi_letture al 
         WHERE al.avviso_id = a.id AND al.user_id = :userId
       )`,
      {
        replacements: { 
          categoriaJson: JSON.stringify([req.user.categoria_socio || 'tutti']),
          utenteJson: JSON.stringify([`utente:${req.user.id}`]),
          userId: req.user.id
        },
        type: QueryTypes.SELECT
      }
    );
    
    stats.avvisi_non_letti = parseInt(avvisiNonLetti?.count || 0);
    
    // Sondaggi aperti
    const [sondaggiAperti] = await sequelize.query(
      `SELECT COUNT(*) as count 
       FROM sondaggi 
       WHERE stato = 'aperto' 
       AND (data_chiusura IS NULL OR data_chiusura >= CURRENT_TIMESTAMP)
       AND (
         destinatari IS NULL 
         OR destinatari::jsonb @> :categoriaJson::jsonb
         OR destinatari::jsonb @> '["tutti"]'::jsonb
       )`,
      {
        replacements: { 
          categoriaJson: JSON.stringify([req.user.categoria_socio || 'tutti'])
        },
        type: QueryTypes.SELECT
      }
    );
    
    stats.sondaggi_aperti = parseInt(sondaggiAperti?.count || 0);
    
    // Assemblee prossime
    // Le riunioni del Consiglio contano solo per chi puo' vederle.
    const visibilita = filtroVisibilitaAssemblee(req.user);
    const [assembleeProssime] = await sequelize.query(
      `SELECT COUNT(*) as count 
       FROM assemblee a
       WHERE a.data_assemblea >= CURRENT_TIMESTAMP 
       AND a.stato = 'programmata'${visibilita.sql}`,
      { replacements: visibilita.replacements, type: sequelize.QueryTypes.SELECT }
    );
    
    stats.assemblee_prossime = parseInt(assembleeProssime?.count || 0);

    // Votazioni aperte in cui questo socio non ha ancora votato: le altre non
    // gli chiedono niente, e un contatore che non chiede niente e' rumore.
    const [votazioniAperte] = await sequelize.query(
      `SELECT COUNT(*) as count
         FROM votazioni v
         JOIN aventi_diritto_votazione a ON a.votazione_id = v.id
        WHERE v.stato = 'aperta'
          AND a.user_id = :userId
          AND a.ha_votato = false`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );

    stats.votazioni_aperte = parseInt(votazioniAperte?.count || 0);

    /**
     * I posti che il socio si e' preso, non il loro numero.
     *
     * "Slot assegnati: 2" non dice quando ne' cosa: per saperlo bisognava
     * aprire i turni e cercarsi dentro. Qui arrivano gia' pronti, in ordine
     * di data, cosi' la schermata iniziale puo' dire "sabato 26 porti i
     * primi" invece di un numero.
     */
    const impegni = await sequelize.query(
      `SELECT s.id, s.tipo_slot, s.numero_porzioni,
              t.id AS turno_id, t.data_turno, t.tipo_turno
         FROM slot_turno s
         JOIN turni_cucina t ON t.id = s.turno_id
        WHERE s.user_id = :userId
          AND t.data_turno >= CURRENT_DATE
        ORDER BY t.data_turno ASC
        LIMIT 5`,
      { replacements: { userId: req.user.id }, type: QueryTypes.SELECT }
    );

    res.json({ stats, impegni });
  } catch (error) {
    logger.error('Errore recupero dashboard:', error);
    res.status(500).json({ error: 'Errore durante il recupero della dashboard' });
  }
};

/**
 * GET /api/v1/dashboard/statistiche
 * Statistiche avanzate (solo admin)
 */
const getStatistiche = async (req, res) => {
  try {
    const stats = {};
    
    // Totale soci attivi
    const [totaleSoci] = await sequelize.query(
      `SELECT COUNT(*) as count 
       FROM users 
       WHERE attivo = true AND archiviato = false`,
      { type: sequelize.QueryTypes.SELECT }
    );
    stats.totale_soci = parseInt(totaleSoci.count);
    
    // Soci per categoria
    const sociPerCategoria = await sequelize.query(
      `SELECT categoria_socio, COUNT(*) as count 
       FROM users 
       WHERE attivo = true AND archiviato = false 
       GROUP BY categoria_socio`,
      { type: sequelize.QueryTypes.SELECT }
    );
    stats.soci_per_categoria = sociPerCategoria;
    
    // Turni questo mese
    const [turniMese] = await sequelize.query(
      `SELECT COUNT(*) as count 
       FROM turni_cucina 
       WHERE DATE_TRUNC('month', data_turno) = DATE_TRUNC('month', CURRENT_DATE)`,
      { type: sequelize.QueryTypes.SELECT }
    );
    stats.turni_mese = parseInt(turniMese.count);
    
    // Quote pagate questo anno
    const [quoteAnno] = await sequelize.query(
      `SELECT COUNT(*) as count, SUM(importo) as totale 
       FROM quote_associative 
       WHERE anno = EXTRACT(YEAR FROM CURRENT_DATE) AND pagata = true`,
      { type: sequelize.QueryTypes.SELECT }
    );
    stats.quote_anno = {
      numero: parseInt(quoteAnno.count),
      totale: parseFloat(quoteAnno.totale || 0)
    };
    
    // Donazioni questo mese
    const [donazioniMese] = await sequelize.query(
      `SELECT COUNT(*) as count, SUM(importo) as totale 
       FROM donazioni 
       WHERE DATE_TRUNC('month', data_donazione) = DATE_TRUNC('month', CURRENT_DATE)
       AND tipo_donazione = 'monetaria'`,
      { type: sequelize.QueryTypes.SELECT }
    );
    stats.donazioni_mese = {
      numero: parseInt(donazioniMese.count),
      totale: parseFloat(donazioniMese.totale || 0)
    };
    
    // Alert magazzino
    const [alertMagazzino] = await sequelize.query(
      `SELECT COUNT(*) as count 
       FROM magazzino_beni 
       WHERE quantita_disponibile <= quantita_minima`,
      { type: sequelize.QueryTypes.SELECT }
    );
    stats.alert_magazzino = parseInt(alertMagazzino.count);
    
    res.json({ stats });
  } catch (error) {
    logger.error('Errore recupero statistiche:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle statistiche' });
  }
};

module.exports = {
  getDashboard,
  getStatistiche
};


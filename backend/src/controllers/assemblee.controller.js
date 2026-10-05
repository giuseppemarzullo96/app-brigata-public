const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');
const { linkAssemblea, rigaWhatsapp, rigaEmail } = require('../utils/link');
const { exportPresenzeCSV } = require('../utils/exportUtils');
const { sendMail } = require('../utils/mailer');
const { sendWhatsApp } = require('../utils/whatsapp');
const path = require('path');
const fs = require('fs');
const {
  TIPO_CONSIGLIO,
  filtroVisibilitaAssemblee,
  puoVedereAssemblea,
  consiglieriInCarica,
} = require('../utils/direttivo');
const { normalizzaDatiVerbaleConsiglio, esitoConsiglio } = require('../utils/datiVerbale');
const { generaVerbaleConsiglioPdf } = require('../utils/verbaleConsiglio');
const { generaConvocazionePdf } = require('../utils/convocazionePdf');
const { caricaCartaIntestata } = require('../utils/cartaIntestata');

/**
 * Carica l'assemblea solo se l'utente puo' vederla. Le riunioni del Consiglio
 * sono riservate: per chi non ne fa parte risultano inesistenti.
 */
async function caricaAssembleaVisibile(id, user) {
  const [assemblea] = await sequelize.query(
    'SELECT * FROM assemblee WHERE id = :id',
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  if (!assemblea) return null;
  return (await puoVedereAssemblea(user, assemblea)) ? assemblea : null;
}

const formatDataAssemblea = (data) =>
  new Date(data).toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

/**
 * GET /api/v1/assemblee
 * Lista assemblee
 */
const getAssemblee = async (req, res) => {
  try {
    const { stato, dataInizio, dataFine } = req.query;
    
    let query = `
      SELECT 
        a.*,
        COUNT(DISTINCT c.user_id) as totale_convocati,
        COUNT(DISTINCT CASE WHEN c.presenza = true THEN c.user_id END) as presenti,
        COUNT(DISTINCT CASE WHEN c.presenza = false THEN c.user_id END) as assenti,
        u.nome as creatore_nome,
        u.cognome as creatore_cognome,
        -- La risposta di CHI sta guardando, non solo il totale: senza, i due
        -- pulsanti "ci saro' / non posso" non sanno cosa mostrare come gia'
        -- scelto, e chi ha gia' risposto non se ne accorge.
        mia.presenza AS mia_presenza
      FROM assemblee a
      LEFT JOIN convocazioni_assemblea c ON a.id = c.assemblea_id
      LEFT JOIN users u ON a.created_by = u.id
      LEFT JOIN convocazioni_assemblea mia
             ON mia.assemblea_id = a.id AND mia.user_id = :utenteCorrente
      WHERE 1=1
    `;
    
    const visibilita = filtroVisibilitaAssemblee(req.user);
    query += visibilita.sql;
    const replacements = { utenteCorrente: req.user.id, ...visibilita.replacements };
    
    if (stato) {
      query += ' AND a.stato = :stato';
      replacements.stato = stato;
    }
    
    if (dataInizio) {
      query += ' AND a.data_assemblea >= :dataInizio';
      replacements.dataInizio = dataInizio;
    }
    
    if (dataFine) {
      query += ' AND a.data_assemblea <= :dataFine';
      replacements.dataFine = dataFine;
    }
    
    query += ' GROUP BY a.id, u.nome, u.cognome, mia.presenza ORDER BY a.data_assemblea DESC';
    
    const assemblee = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });
    
    res.json({ assemblee });
  } catch (error) {
    logger.error('Errore recupero assemblee:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle assemblee' });
  }
};

/**
 * GET /api/v1/assemblee/:id
 * Dettaglio assemblea
 */
const getAssembleaById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [assemblea] = await sequelize.query(
      `SELECT a.*, u.nome as creatore_nome, u.cognome as creatore_cognome
       FROM assemblee a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.id = :id`,
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!assemblea || !(await puoVedereAssemblea(req.user, assemblea))) {
      return res.status(404).json({ error: 'Assemblea non trovata' });
    }
    
    // Recupera allegati
    const allegati = await sequelize.query(
      `SELECT id, COALESCE(titolo, nome_file) AS titolo, nome_file, tipo_file, dimensione, created_at
         FROM allegati_assemblea WHERE assemblea_id = :id ORDER BY created_at, id`,
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    // Recupera lo stato della presenza dell'utente corrente
    let presenzaUtente = null;
    if (req.user) {
      const [convocazione] = await sequelize.query(
        `SELECT presenza FROM convocazioni_assemblea 
         WHERE assemblea_id = :assembleaId AND user_id = :userId`,
        {
          replacements: {
            assembleaId: id,
            userId: req.user.id
          },
          type: QueryTypes.SELECT
        }
      );
      presenzaUtente = convocazione?.presenza ?? null;
    }
    
    res.json({ assemblea, allegati, presenzaUtente });
  } catch (error) {
    logger.error('Errore recupero assemblea:', error);
    res.status(500).json({ error: 'Errore durante il recupero dell\'assemblea' });
  }
};

/**
 * POST /api/v1/assemblee
 * Crea assemblea
 */
const createAssemblea = async (req, res) => {
  try {
    const {
      titolo,
      data_assemblea,
      luogo,
      ordine_del_giorno,
      tipo_assemblea
    } = req.body;
    
    if (!titolo || !data_assemblea) {
      return res.status(400).json({ error: 'Titolo e data assemblea obbligatori' });
    }
    
    const [result] = await sequelize.query(
      `INSERT INTO assemblee (
        titolo, data_assemblea, luogo, ordine_del_giorno, tipo_assemblea, created_by
      ) VALUES (
        :titolo, :dataAssemblea, :luogo, :ordineDelGiorno, :tipoAssemblea, :createdBy
      ) RETURNING *`,
      {
        replacements: {
          titolo,
          dataAssemblea: data_assemblea,
          luogo: luogo || null,
          ordineDelGiorno: ordine_del_giorno || null,
          tipoAssemblea: tipo_assemblea || 'ordinaria',
          createdBy: req.user.id
        },
        type: QueryTypes.INSERT
      }
    );
    
    const assemblea = result[0];
    
    // Crea automaticamente un avviso: per le assemblee a volontari e soci
    // ordinari, per le riunioni del Consiglio ai soli consiglieri in carica
    // (un avviso per categoria lo leggerebbero tutti, ordine del giorno compreso).
    const consiglio = assemblea.tipo_assemblea === TIPO_CONSIGLIO;
    const destinatariAvviso = consiglio
      ? (await consiglieriInCarica()).map((c) => `utente:${c.user_id}`)
      : ['volontario', 'ordinario'];
    if (destinatariAvviso.length > 0) {
      try {
        // Formatta la data dell'assemblea
        const dataAssembleaObj = new Date(data_assemblea);
        const giorni = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 
                      'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
        const giornoSettimana = giorni[dataAssembleaObj.getDay()];
        const giorno = dataAssembleaObj.getDate();
        const mese = mesi[dataAssembleaObj.getMonth()];
        const anno = dataAssembleaObj.getFullYear();
        const ore = String(dataAssembleaObj.getHours()).padStart(2, '0');
        const minuti = String(dataAssembleaObj.getMinutes()).padStart(2, '0');
        const dataAssembleaFormattata = `${giornoSettimana} ${giorno} ${mese} ${anno} alle ${ore}:${minuti}`;
      
        // Costruisci il contenuto dell'avviso
        let contenutoAvviso = consiglio
          ? 'È stata convocata una riunione del Consiglio direttivo:\n\n'
          : `È stata convocata una nuova assemblea:\n\n`;
        contenutoAvviso += `📅 Data: ${dataAssembleaFormattata}\n`;
        if (luogo) {
          contenutoAvviso += `📍 Luogo: ${luogo}\n`;
        }
        contenutoAvviso += `📋 Tipo: ${tipo_assemblea || 'Ordinaria'}\n\n`;
        if (ordine_del_giorno) {
          contenutoAvviso += `Ordine del giorno:\n${ordine_del_giorno}\n\n`;
        }
        contenutoAvviso += `Per maggiori informazioni, consulta la sezione Assemblee nell'app.`;
      
        // Crea l'avviso destinato a volontari e soci ordinari
        await sequelize.query(
          `INSERT INTO avvisi (
            titolo, contenuto, priorita, destinatari, pubblicato, data_pubblicazione, assemblea_id, created_by
          ) VALUES (
            :titolo, :contenuto, :priorita, :destinatari, true, CURRENT_TIMESTAMP, :assembleaId, :createdBy
          ) RETURNING *`,
          {
            replacements: {
              titolo: `${consiglio ? 'Riunione del Consiglio direttivo' : 'Nuova Assemblea'}: ${titolo}`,
              contenuto: contenutoAvviso,
              priorita: 'alta',
              destinatari: JSON.stringify(destinatariAvviso),
              assembleaId: assemblea.id,
              createdBy: req.user.id
            },
            type: QueryTypes.INSERT
          }
        );
      
        logger.info(`Avviso creato automaticamente per assemblea ${assemblea.id}`);
      } catch (avvisoError) {
        // Non bloccare la creazione dell'assemblea se l'avviso fallisce
        logger.error('Errore creazione avviso per assemblea:', avvisoError);
      }
    }
    
    logger.info(`Assemblea creata: ${titolo} da ${req.user.email}`);
    
    res.status(201).json({ assemblea });
  } catch (error) {
    logger.error('Errore creazione assemblea:', error);
    res.status(500).json({ error: 'Errore durante la creazione dell\'assemblea' });
  }
};

/**
 * PUT /api/v1/assemblee/:id
 * Aggiorna assemblea
 */
const updateAssemblea = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      titolo,
      data_assemblea,
      luogo,
      ordine_del_giorno,
      tipo_assemblea,
      stato
    } = req.body;
    
    const [assemblea] = await sequelize.query(
      'SELECT id FROM assemblee WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!assemblea) {
      return res.status(404).json({ error: 'Assemblea non trovata' });
    }
    
    await sequelize.query(
      `UPDATE assemblee 
       SET titolo = COALESCE(:titolo, titolo),
           data_assemblea = COALESCE(:dataAssemblea, data_assemblea),
           luogo = COALESCE(:luogo, luogo),
           ordine_del_giorno = COALESCE(:ordineDelGiorno, ordine_del_giorno),
           tipo_assemblea = COALESCE(:tipoAssemblea, tipo_assemblea),
           stato = COALESCE(:stato, stato),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        replacements: {
          id,
          titolo,
          dataAssemblea: data_assemblea,
          luogo,
          ordineDelGiorno: ordine_del_giorno,
          tipoAssemblea: tipo_assemblea,
          stato
        },
        type: QueryTypes.UPDATE
      }
    );
    
    res.json({ message: 'Assemblea aggiornata con successo' });
  } catch (error) {
    logger.error('Errore aggiornamento assemblea:', error);
    res.status(500).json({ error: 'Errore durante l\'aggiornamento dell\'assemblea' });
  }
};

/**
 * DELETE /api/v1/assemblee/:id
 * Elimina assemblea
 */
const deleteAssemblea = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [assemblea] = await sequelize.query(
      'SELECT id FROM assemblee WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!assemblea) {
      return res.status(404).json({ error: 'Assemblea non trovata' });
    }
    
    // Elimina prima le convocazioni (CASCADE dovrebbe gestirlo, ma meglio essere espliciti)
    await sequelize.query(
      'DELETE FROM convocazioni_assemblea WHERE assemblea_id = :id',
      {
        replacements: { id },
        type: QueryTypes.DELETE
      }
    );
    
    // Elimina gli allegati se esistono
    await sequelize.query(
      'DELETE FROM allegati_assemblea WHERE assemblea_id = :id',
      {
        replacements: { id },
        type: QueryTypes.DELETE
      }
    );
    
    // Elimina l'assemblea
    await sequelize.query(
      'DELETE FROM assemblee WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.DELETE
      }
    );
    
    logger.info(`Assemblea ${id} eliminata da ${req.user.email}`);
    
    res.json({ message: 'Assemblea eliminata con successo' });
  } catch (error) {
    logger.error('Errore eliminazione assemblea:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione dell\'assemblea' });
  }
};

/**
 * POST /api/v1/assemblee/:id/invia-convocazioni
 * Invia convocazioni a tutti i soci
 */
const inviaConvocazioni = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verifica assemblea
    const [assemblea] = await sequelize.query(
      'SELECT * FROM assemblee WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!assemblea) {
      return res.status(404).json({ error: 'Assemblea non trovata' });
    }
    
    const consiglio = assemblea.tipo_assemblea === TIPO_CONSIGLIO;

    // Per il Consiglio solo i consiglieri in carica (art. 11: lo convoca il
    // Presidente); per le assemblee tutti i soci attivi, esclusi sospesi ed
    // enti fittizi senza casella reale.
    const soci = consiglio
      ? (await consiglieriInCarica()).map((c) => ({ ...c, id: c.user_id }))
      : await sequelize.query(
        `SELECT id, email, nome, cognome, telefono FROM users
         WHERE attivo = true AND archiviato = false AND sospeso = false AND fittizio = false
         AND (categoria_socio IN ('volontario', 'ordinario') OR ruolo = 'admin')`,
        {
          type: QueryTypes.SELECT
        }
      );

    if (consiglio && soci.length === 0) {
      return res.status(400).json({
        error: 'Nessun consigliere in carica: registra prima la composizione del Consiglio direttivo',
      });
    }
    const organo = consiglio ? 'riunione del Consiglio direttivo' : 'assemblea';

    const dataFormattata = formatDataAssemblea(assemblea.data_assemblea);
    const corpoHtml = `
      <p>Sei convocato/a alla ${organo} <strong>${assemblea.titolo}</strong>.</p>
      <p><strong>Data:</strong> ${dataFormattata}</p>
      ${assemblea.luogo ? `<p><strong>Luogo:</strong> ${assemblea.luogo}</p>` : ''}
      ${assemblea.ordine_del_giorno ? `<p><strong>Ordine del giorno:</strong><br/>${assemblea.ordine_del_giorno.replace(/\n/g, '<br/>')}</p>` : ''}
      ${rigaEmail(linkAssemblea(id), 'Apri la convocazione')}
    `;
    const urlAssemblea = linkAssemblea(id);
    const testoWhatsapp = `📋 *Convocazione ${consiglio ? 'Consiglio direttivo' : 'Assemblea'}*\n\n*${assemblea.titolo}*\n\n🗓️ ${dataFormattata}${assemblea.luogo ? `\n📍 ${assemblea.luogo}` : ''}${assemblea.ordine_del_giorno ? `\n\nOrdine del giorno:\n${assemblea.ordine_del_giorno}` : ''}` + rigaWhatsapp(urlAssemblea, 'Apri la convocazione');

    // Crea/aggiorna convocazioni e invia effettivamente email + WhatsApp a ciascun socio
    let convocazioniCreate = 0;
    let emailInviate = 0;
    let whatsappInviati = 0;
    for (const socio of soci) {
      try {
        await sequelize.query(
          `INSERT INTO convocazioni_assemblea (assemblea_id, user_id, email_inviata)
           VALUES (:assembleaId, :userId, false)
           ON CONFLICT (assemblea_id, user_id) DO NOTHING`,
          {
            replacements: {
              assembleaId: id,
              userId: socio.id
            },
            type: QueryTypes.INSERT
          }
        );
        convocazioniCreate++;

        const risultatoMail = await sendMail({
          to: socio.email,
          subject: `Convocazione ${organo}: ${assemblea.titolo}`,
          titolo: consiglio ? 'Convocazione Consiglio direttivo' : 'Convocazione Assemblea',
          corpoHtml,
        });
        if (risultatoMail.sent) {
          emailInviate++;
          await sequelize.query(
            `UPDATE convocazioni_assemblea SET email_inviata = true
             WHERE assemblea_id = :assembleaId AND user_id = :userId`,
            { replacements: { assembleaId: id, userId: socio.id }, type: QueryTypes.UPDATE }
          );
        }

        if (socio.telefono) {
          const risultatoWa = await sendWhatsApp(socio.telefono, testoWhatsapp);
          if (risultatoWa.sent) whatsappInviati++;
        }
      } catch (err) {
        logger.error(`Errore invio convocazione per ${socio.email}:`, err);
      }
    }

    logger.info(`Convocazioni: ${convocazioniCreate} create, ${emailInviate} email inviate, ${whatsappInviati} WhatsApp inviati`);

    res.json({
      message: `Convocazioni inviate a ${convocazioniCreate} ${consiglio ? 'consiglieri' : 'soci'} (${emailInviate} email, ${whatsappInviati} WhatsApp)`,
      totale: convocazioniCreate,
      emailInviate,
      whatsappInviati
    });
  } catch (error) {
    logger.error('Errore invio convocazioni:', error);
    res.status(500).json({ error: 'Errore durante l\'invio delle convocazioni' });
  }
};

/**
 * PUT /api/v1/assemblee/:id/presenza
 * Registra presenza
 */
const registraPresenza = async (req, res) => {
  try {
    const { id } = req.params;
    const { presenza } = req.body;
    
    if (presenza === undefined) {
      return res.status(400).json({ error: 'Campo presenza obbligatorio (true/false)' });
    }

    if (!(await caricaAssembleaVisibile(id, req.user))) {
      return res.status(404).json({ error: 'Assemblea non trovata' });
    }
    
    // Verifica convocazione esiste
    const [convocazione] = await sequelize.query(
      `SELECT * FROM convocazioni_assemblea 
       WHERE assemblea_id = :assembleaId AND user_id = :userId`,
      {
        replacements: {
          assembleaId: id,
          userId: req.user.id
        },
        type: QueryTypes.SELECT
      }
    );
    
    if (!convocazione) {
      // Crea convocazione se non esiste
      await sequelize.query(
        `INSERT INTO convocazioni_assemblea (assemblea_id, user_id, presenza, data_risposta)
         VALUES (:assembleaId, :userId, :presenza, CURRENT_TIMESTAMP)`,
        {
          replacements: {
            assembleaId: id,
            userId: req.user.id,
            presenza
          },
          type: QueryTypes.INSERT
        }
      );
    } else {
      // Aggiorna presenza
      await sequelize.query(
        `UPDATE convocazioni_assemblea 
         SET presenza = :presenza, data_risposta = CURRENT_TIMESTAMP
         WHERE assemblea_id = :assembleaId AND user_id = :userId`,
        {
          replacements: {
            assembleaId: id,
            userId: req.user.id,
            presenza
          },
          type: QueryTypes.UPDATE
        }
      );
    }
    
    res.json({ message: 'Presenza registrata con successo' });
  } catch (error) {
    logger.error('Errore registrazione presenza:', error);
    res.status(500).json({ error: 'Errore durante la registrazione della presenza' });
  }
};

/**
 * GET /api/v1/assemblee/:id/presenze
 * Lista presenze
 */
const getPresenze = async (req, res) => {
  try {
    const { id } = req.params;

    if (!(await caricaAssembleaVisibile(id, req.user))) {
      return res.status(404).json({ error: 'Assemblea non trovata' });
    }
    
    const presenze = await sequelize.query(
      `SELECT 
        c.*,
        u.nome,
        u.cognome,
        u.email,
        u.categoria_socio
       FROM convocazioni_assemblea c
       JOIN users u ON c.user_id = u.id
       WHERE c.assemblea_id = :assembleaId
       ORDER BY c.data_risposta DESC, u.cognome, u.nome`,
      {
        replacements: { assembleaId: id },
        type: QueryTypes.SELECT
      }
    );
    
    res.json({ presenze });
  } catch (error) {
    logger.error('Errore recupero presenze:', error);
    res.status(500).json({ error: 'Errore durante il recupero delle presenze' });
  }
};

/**
 * POST /api/v1/assemblee/:id/verbale
 * Carica verbale (file upload)
 */
const caricaVerbale = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'File verbale obbligatorio' });
    }
    
    // Verifica assemblea
    const [assemblea] = await sequelize.query(
      'SELECT id FROM assemblee WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!assemblea) {
      return res.status(404).json({ error: 'Assemblea non trovata' });
    }
    
    const verbalePath = `/uploads/verbali/${req.file.filename}`;
    
    await sequelize.query(
      `UPDATE assemblee 
       SET verbale_path = :verbalePath, updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        replacements: {
          id,
          verbalePath
        },
        type: QueryTypes.UPDATE
      }
    );
    
    logger.info(`Verbale caricato per assemblea ${id} da ${req.user.email}`);
    
    res.json({ 
      message: 'Verbale caricato con successo',
      path: verbalePath,
      filename: req.file.filename
    });
  } catch (error) {
    logger.error('Errore caricamento verbale:', error);
    res.status(500).json({ error: 'Errore durante il caricamento del verbale' });
  }
};

/**
 * POST /api/v1/assemblee/:id/convocazione
 * Carica convocazione firmata (file upload)
 */
const caricaConvocazione = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'File convocazione obbligatorio' });
    }
    
    // Verifica assemblea
    const [assemblea] = await sequelize.query(
      'SELECT id FROM assemblee WHERE id = :id',
      {
        replacements: { id },
        type: QueryTypes.SELECT
      }
    );
    
    if (!assemblea) {
      return res.status(404).json({ error: 'Assemblea non trovata' });
    }
    
    const convocazionePath = `/uploads/convocazioni/${req.file.filename}`;
    
    await sequelize.query(
      `UPDATE assemblee 
       SET convocazione_path = :convocazionePath, updated_at = CURRENT_TIMESTAMP
       WHERE id = :id`,
      {
        replacements: {
          id,
          convocazionePath
        },
        type: QueryTypes.UPDATE
      }
    );
    
    logger.info(`Convocazione caricata per assemblea ${id} da ${req.user.email}`);
    
    res.json({ 
      message: 'Convocazione caricata con successo',
      path: convocazionePath,
      filename: req.file.filename
    });
  } catch (error) {
    logger.error('Errore caricamento convocazione:', error);
    res.status(500).json({ error: 'Errore durante il caricamento della convocazione' });
  }
};

/**
 * GET /api/v1/assemblee/:id/presenze/export
 * Export presenze CSV
 */
const exportPresenze = async (req, res) => {
  try {
    const { id } = req.params;
    
    const presenze = await sequelize.query(
      `SELECT 
        c.*,
        u.nome,
        u.cognome,
        u.email,
        u.categoria_socio
       FROM convocazioni_assemblea c
       JOIN users u ON c.user_id = u.id
       WHERE c.assemblea_id = :assembleaId
       ORDER BY u.cognome, u.nome`,
      {
        replacements: { assembleaId: id },
        type: QueryTypes.SELECT
      }
    );
    
    const csv = exportPresenzeCSV(presenze);
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="presenze_assemblea_${id}.csv"`);
    res.send('\ufeff' + csv); // BOM per Excel
  } catch (error) {
    logger.error('Errore export presenze:', error);
    res.status(500).json({ error: 'Errore durante l\'export' });
  }
};

/**
 * GET /api/v1/assemblee/:id/verbale e /convocazione
 * Scarica il file caricato, solo a chi puo' vedere l'assemblea: i file non
 * sono piu' serviti come statici pubblici.
 */
const scaricaDocumento = (colonna) => async (req, res) => {
  try {
    const assemblea = await caricaAssembleaVisibile(req.params.id, req.user);
    if (!assemblea || !assemblea[colonna]) {
      return res.status(404).json({ error: 'Documento non trovato' });
    }
    const base = path.resolve(process.env.UPLOAD_PATH || './uploads');
    const relativo = String(assemblea[colonna]).replace(/^\/uploads\//, '');
    const percorso = path.resolve(base, relativo);
    // Il percorso viene dal database, ma resta dentro la cartella degli upload.
    if (!percorso.startsWith(base + path.sep) || !fs.existsSync(percorso)) {
      return res.status(404).json({ error: 'Documento non trovato' });
    }
    res.download(percorso, path.basename(percorso));
  } catch (error) {
    logger.error('Errore download documento assemblea:', error);
    res.status(500).json({ error: 'Errore durante il download' });
  }
};

/** Consiglieri da proporre nel verbale: quelli in carica alla data della riunione. */
async function consiglieriDellaRiunione(assemblea) {
  return consiglieriInCarica(assemblea.data_assemblea);
}

/**
 * GET /api/v1/assemblee/:id/dati-verbale-consiglio (solo admin)
 */
const getDatiVerbaleConsiglio = async (req, res) => {
  try {
    const assemblea = await caricaAssembleaVisibile(req.params.id, req.user);
    if (!assemblea) return res.status(404).json({ error: 'Assemblea non trovata' });
    if (assemblea.tipo_assemblea !== TIPO_CONSIGLIO) {
      return res.status(409).json({ error: 'Il verbale del Consiglio si compila solo per le riunioni di tipo consiglio' });
    }
    const consiglieri = await consiglieriDellaRiunione(assemblea);
    const dati = assemblea.dati_verbale || null;
    res.json({
      dati,
      consiglieri,
      esito: esitoConsiglio(dati || { consiglieri: consiglieri.map((c) => ({ ...c, presente: false })) }),
    });
  } catch (error) {
    logger.error('Errore recupero dati verbale consiglio:', error);
    res.status(500).json({ error: 'Errore durante il recupero dei dati del verbale' });
  }
};

/**
 * PUT /api/v1/assemblee/:id/dati-verbale-consiglio (solo admin)
 * Body: { numero_verbale, presidente, segretario, ..., presenti: [user_id], delibere: [...] }
 */
const salvaDatiVerbaleConsiglio = async (req, res) => {
  try {
    const assemblea = await caricaAssembleaVisibile(req.params.id, req.user);
    if (!assemblea) return res.status(404).json({ error: 'Assemblea non trovata' });
    if (assemblea.tipo_assemblea !== TIPO_CONSIGLIO) {
      return res.status(409).json({ error: 'Il verbale del Consiglio si compila solo per le riunioni di tipo consiglio' });
    }
    const consiglieri = await consiglieriDellaRiunione(assemblea);
    const { dati, errore } = normalizzaDatiVerbaleConsiglio(req.body || {}, consiglieri);
    if (errore) return res.status(400).json({ error: errore });

    await sequelize.query(
      `UPDATE assemblee SET dati_verbale = CAST(:dati AS JSONB), updated_at = CURRENT_TIMESTAMP
        WHERE id = :id`,
      { replacements: { id: assemblea.id, dati: JSON.stringify(dati) } }
    );
    res.json({ message: 'Dati del verbale salvati', dati, esito: esitoConsiglio(dati) });
  } catch (error) {
    logger.error('Errore salvataggio dati verbale consiglio:', error);
    res.status(500).json({ error: 'Errore durante il salvataggio dei dati del verbale' });
  }
};

/**
 * GET /api/v1/assemblee/:id/verbale-consiglio
 * PDF del verbale della riunione, per i soli consiglieri e gli admin.
 */
const getVerbaleConsiglio = async (req, res) => {
  try {
    const assemblea = await caricaAssembleaVisibile(req.params.id, req.user);
    if (!assemblea || assemblea.tipo_assemblea !== TIPO_CONSIGLIO) {
      return res.status(404).json({ error: 'Assemblea non trovata' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="verbale-consiglio-${assemblea.id}.pdf"`);
    const allegati = await allegatiVerbale(assemblea.id);
    const cartaIntestata = await caricaCartaIntestata();
    generaVerbaleConsiglioPdf({ assemblea, dati: assemblea.dati_verbale, allegati }, res, { cartaIntestata });
  } catch (error) {
    logger.error('Errore generazione verbale consiglio:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Errore durante la generazione del verbale' });
  }
};

/** Allegati del verbale di un'assemblea, in ordine di caricamento. */
async function allegatiVerbale(assembleaId) {
  if (!assembleaId) return [];
  return sequelize.query(
    `SELECT id, COALESCE(titolo, nome_file) AS titolo, nome_file, tipo_file, dimensione, created_at
       FROM allegati_assemblea WHERE assemblea_id = :id ORDER BY created_at, id`,
    { replacements: { id: assembleaId }, type: QueryTypes.SELECT }
  );
}

/**
 * POST /api/v1/assemblee/:id/allegati (solo admin)
 * Multipart: allegato_verbale (file), titolo (testo, facoltativo).
 */
const caricaAllegato = async (req, res) => {
  const scarta = () => { if (req.file) fs.rm(req.file.path, { force: true }, () => {}); };
  try {
    if (!req.file) return res.status(400).json({ error: 'File obbligatorio' });
    const assemblea = await caricaAssembleaVisibile(req.params.id, req.user);
    if (!assemblea) { scarta(); return res.status(404).json({ error: 'Assemblea non trovata' }); }

    const titolo = String(req.body?.titolo || '').trim().slice(0, 255) || req.file.originalname;
    const [righe] = await sequelize.query(
      `INSERT INTO allegati_assemblea (assemblea_id, titolo, nome_file, path_file, tipo_file, dimensione, uploaded_by)
       VALUES (:assembleaId, :titolo, :nomeFile, :percorso, :tipo, :dimensione, :utente)
       RETURNING id, titolo, nome_file, tipo_file, dimensione, created_at`,
      {
        replacements: {
          assembleaId: assemblea.id,
          titolo,
          nomeFile: req.file.originalname.slice(0, 255),
          percorso: `/uploads/verbali/${req.file.filename}`,
          tipo: path.extname(req.file.originalname).replace('.', '').toLowerCase().slice(0, 50),
          dimensione: req.file.size,
          utente: req.user.id,
        },
        type: QueryTypes.INSERT,
      }
    );
    res.status(201).json({ allegato: righe[0] });
  } catch (error) {
    scarta();
    logger.error('Errore caricamento allegato:', error);
    res.status(500).json({ error: 'Errore durante il caricamento dell\'allegato' });
  }
};

async function trovaAllegato(req) {
  const assemblea = await caricaAssembleaVisibile(req.params.id, req.user);
  if (!assemblea) return null;
  const [allegato] = await sequelize.query(
    'SELECT * FROM allegati_assemblea WHERE id = :allegatoId AND assemblea_id = :assembleaId',
    { replacements: { allegatoId: req.params.allegatoId, assembleaId: assemblea.id }, type: QueryTypes.SELECT }
  );
  return allegato || null;
}

function percorsoLocale(pathFile) {
  const base = path.resolve(process.env.UPLOAD_PATH || './uploads');
  const percorso = path.resolve(base, String(pathFile).replace(/^\/uploads\//, ''));
  return percorso.startsWith(base + path.sep) ? percorso : null;
}

/** GET /api/v1/assemblee/:id/allegati/:allegatoId (chi puo' vedere l'assemblea) */
const scaricaAllegato = async (req, res) => {
  try {
    const allegato = await trovaAllegato(req);
    const percorso = allegato && percorsoLocale(allegato.path_file);
    if (!percorso || !fs.existsSync(percorso)) return res.status(404).json({ error: 'Allegato non trovato' });
    res.download(percorso, allegato.nome_file);
  } catch (error) {
    logger.error('Errore download allegato:', error);
    res.status(500).json({ error: 'Errore durante il download' });
  }
};

/** DELETE /api/v1/assemblee/:id/allegati/:allegatoId (solo admin) */
const eliminaAllegato = async (req, res) => {
  try {
    const allegato = await trovaAllegato(req);
    if (!allegato) return res.status(404).json({ error: 'Allegato non trovato' });
    await sequelize.query('DELETE FROM allegati_assemblea WHERE id = :id', { replacements: { id: allegato.id } });
    const percorso = percorsoLocale(allegato.path_file);
    if (percorso) fs.rm(percorso, { force: true }, () => {});
    res.json({ message: 'Allegato eliminato' });
  } catch (error) {
    logger.error('Errore eliminazione allegato:', error);
    res.status(500).json({ error: 'Errore durante l\'eliminazione dell\'allegato' });
  }
};

/**
 * GET /api/v1/assemblee/:id/convocazione-pdf?prima=AAAA-MM-GGTHH:MM&data=AAAA-MM-GG (solo admin)
 * Avviso di convocazione pronto da firmare. La data dell'assemblea e' quella
 * della seconda convocazione (per convenzione le assemblee si tengono in
 * seconda); `prima` indica la prima, di default il giorno precedente.
 */
const generaConvocazione = async (req, res) => {
  try {
    const assemblea = await caricaAssembleaVisibile(req.params.id, req.user);
    if (!assemblea) return res.status(404).json({ error: 'Assemblea non trovata' });

    const consiglieri = await consiglieriInCarica(assemblea.data_assemblea);
    const presidente = consiglieri.find((c) => c.carica === 'presidente');
    const cartaIntestata = await caricaCartaIntestata();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="convocazione-${assemblea.id}.pdf"`);
    generaConvocazionePdf({
      assemblea,
      presidente: presidente ? `${presidente.nome} ${presidente.cognome}` : null,
      consiglieri: assemblea.tipo_assemblea === TIPO_CONSIGLIO ? consiglieri : [],
      prima: req.query.prima,
      dataDocumento: req.query.data,
    }, res, { cartaIntestata });
  } catch (error) {
    logger.error('Errore generazione convocazione:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Errore durante la generazione della convocazione' });
  }
};

module.exports = {
  generaConvocazione,
  allegatiVerbale,
  caricaAllegato,
  scaricaAllegato,
  eliminaAllegato,
  scaricaVerbale: scaricaDocumento('verbale_path'),
  scaricaConvocazione: scaricaDocumento('convocazione_path'),
  getDatiVerbaleConsiglio,
  salvaDatiVerbaleConsiglio,
  getVerbaleConsiglio,
  getAssemblee,
  getAssembleaById,
  createAssemblea,
  updateAssemblea,
  deleteAssemblea,
  inviaConvocazioni,
  registraPresenza,
  getPresenze,
  caricaVerbale,
  caricaConvocazione,
  exportPresenze
};

const logger = require('../utils/logger');
const tessera = require('../utils/tessera');

/**
 * La tessera digitale del socio collegato.
 * Solo la propria: la tessera va nel wallet di chi la chiede.
 */

/** GET /api/v1/tessera */
const getMia = async (req, res) => {
  try {
    const dati = await tessera.tesseraDi(req.user.id);
    if (!dati) return res.status(404).json({ error: 'Utente non trovato' });
    res.json({ ...dati, wallet: tessera.walletDisponibili() });
  } catch (error) {
    logger.error('Errore lettura tessera:', error);
    res.status(500).json({ error: 'Errore durante la lettura della tessera' });
  }
};

/** La tessera se spetta, altrimenti risponde lei e restituisce null. */
async function tesseraValida(req, res) {
  const dati = await tessera.tesseraDi(req.user.id);
  if (!dati?.tessera) {
    res.status(403).json({ error: 'La tessera spetta ai soci in regola con la quota dell\'anno in corso' });
    return null;
  }
  return dati.tessera;
}

/** GET /api/v1/tessera/apple — il link, di pochi minuti, al file .pkpass. */
const linkApple = async (req, res) => {
  try {
    if (!tessera.walletDisponibili().apple) return res.status(503).json({ error: 'Apple Wallet non ancora attivo' });
    if (!(await tesseraValida(req, res))) return;
    res.json({ url: tessera.linkApple(req.user.id) });
  } catch (error) {
    logger.error('Errore link Apple Wallet:', error);
    res.status(500).json({ error: 'Errore durante la preparazione della tessera' });
  }
};

/** GET /api/v1/tessera/google — il link "Aggiungi a Google Wallet". */
const linkGoogle = async (req, res) => {
  try {
    if (!tessera.walletDisponibili().google) return res.status(503).json({ error: 'Google Wallet non ancora attivo' });
    const dati = await tesseraValida(req, res);
    if (!dati) return;
    res.json({ url: await tessera.linkGoogle(dati) });
  } catch (error) {
    logger.error('Errore link Google Wallet:', error);
    res.status(500).json({ error: 'Errore durante la preparazione della tessera' });
  }
};

/**
 * GET /api/v1/pubblico/tessera-apple/:gettone
 * Senza sessione: ci arriva Safari, e l'autorizzazione e' il gettone firmato.
 * La tessera si ricontrolla qui, non al momento del link.
 */
const scaricaApple = async (req, res) => {
  try {
    const userId = tessera.userIdDaGettoneApple(req.params.gettone);
    if (!userId) return res.status(404).json({ error: 'Link scaduto: richiedi di nuovo la tessera dall\'app' });

    const dati = await tessera.tesseraDi(userId);
    if (!dati?.tessera) return res.status(403).json({ error: 'Tessera non disponibile' });

    const file = tessera.passApple(dati.tessera);
    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="tessera-labrigata-${dati.anno}.pkpass"`,
      'Cache-Control': 'no-store',
    });
    res.send(file);
  } catch (error) {
    logger.error('Errore generazione pass Apple:', error);
    res.status(500).json({ error: 'Errore durante la preparazione della tessera' });
  }
};

/**
 * GET /api/v1/pubblico/tessera/:codice
 * La pagina a cui porta il QR: chiunque lo legga vede se la tessera vale oggi.
 */
const verifica = async (req, res) => {
  try {
    const dati = await tessera.verificaCodice(req.params.codice);
    if (!dati) return res.status(404).json({ error: 'Tessera non trovata' });
    res.set('Cache-Control', 'no-store');
    res.json(dati);
  } catch (error) {
    logger.error('Errore verifica tessera:', error);
    res.status(500).json({ error: 'Errore durante la verifica della tessera' });
  }
};

module.exports = { getMia, linkApple, linkGoogle, scaricaApple, verifica };

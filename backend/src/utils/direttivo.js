const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Chi fa parte del Consiglio direttivo e chi puo' vedere le sue riunioni.
 *
 * Le riunioni di tipo "consiglio" le vedono gli admin, i consiglieri in carica
 * e chi era in carica alla data della riunione: un ex consigliere deve poter
 * rileggere i verbali delle sedute a cui ha partecipato. Agli altri soci la
 * riunione risulta inesistente (404), cosi' non se ne rivela nemmeno il titolo.
 */

const TIPO_CONSIGLIO = 'consiglio';
const ORGANO = 'consiglio_direttivo';
const CARICHE = ['presidente', 'vicepresidente', 'segretario', 'consigliere'];

/** Condizione SQL: la carica `c` copre la data `data` (DATE o espressione). */
const inCaricaAl = (alias, data) =>
  `${alias}.organo = '${ORGANO}' AND ${alias}.dal <= ${data} AND (${alias}.al IS NULL OR ${alias}.al >= ${data})`;

/**
 * Filtro SQL per le assemblee visibili all'utente. Da usare con l'alias `a`
 * sulla tabella assemblee e il replacement :utenteVisibilita.
 */
function filtroVisibilitaAssemblee(user) {
  if (user?.ruolo === 'admin') return { sql: '', replacements: {} };
  return {
    sql: ` AND (COALESCE(a.tipo_assemblea, '') <> '${TIPO_CONSIGLIO}' OR EXISTS (
             SELECT 1 FROM cariche_sociali cs
              WHERE cs.user_id = :utenteVisibilita
                AND (${inCaricaAl('cs', 'CURRENT_DATE')}
                     OR ${inCaricaAl('cs', 'CAST(a.data_assemblea AS DATE)')})))`,
    replacements: { utenteVisibilita: user?.id || null },
  };
}

/** L'utente puo' vedere questa assemblea? */
async function puoVedereAssemblea(user, assemblea) {
  if (!assemblea) return false;
  if (assemblea.tipo_assemblea !== TIPO_CONSIGLIO || user?.ruolo === 'admin') return true;
  const [riga] = await sequelize.query(
    `SELECT 1 FROM cariche_sociali cs
      WHERE cs.user_id = :userId
        AND (${inCaricaAl('cs', 'CURRENT_DATE')} OR ${inCaricaAl('cs', 'CAST(:data AS DATE)')})
      LIMIT 1`,
    { replacements: { userId: user.id, data: assemblea.data_assemblea }, type: QueryTypes.SELECT }
  );
  return Boolean(riga);
}

/**
 * Consiglieri in carica a una data (default oggi), una riga per persona con la
 * carica piu' alta se ne ha piu' d'una.
 */
async function consiglieriInCarica(data = null) {
  const riferimento = data ? 'CAST(:data AS DATE)' : 'CURRENT_DATE';
  return sequelize.query(
    `SELECT DISTINCT ON (u.id) u.id AS user_id, u.nome, u.cognome, u.email, u.telefono, cs.carica
       FROM cariche_sociali cs
       JOIN users u ON u.id = cs.user_id
      WHERE ${inCaricaAl('cs', riferimento)}
      ORDER BY u.id, array_position(ARRAY['presidente','vicepresidente','segretario','consigliere']::varchar[], cs.carica)`,
    { replacements: { data }, type: QueryTypes.SELECT }
  ).then((righe) => righe.sort((a, b) =>
    CARICHE.indexOf(a.carica) - CARICHE.indexOf(b.carica)
      || `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it')));
}

module.exports = {
  TIPO_CONSIGLIO,
  ORGANO,
  CARICHE,
  inCaricaAl,
  filtroVisibilitaAssemblee,
  puoVedereAssemblea,
  consiglieriInCarica,
};

const { preparaDatabaseTest } = require('./helpers/testDb');

/**
 * Eseguito una sola volta prima dell'intera suite: ricrea da zero il database
 * di test e vi carica schema e migration.
 */
module.exports = async () => {
  preparaDatabaseTest();
};

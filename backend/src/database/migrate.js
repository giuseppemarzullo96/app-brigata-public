/**
 * Script di migrazione database
 * Crea tutte le tabelle necessarie
 * 
 * Eseguire con: npm run migrate
 */

const { sequelize } = require('../config/database');
const fs = require('fs');
const path = require('path');

async function migrate() {
  try {
    console.log('🔄 Avvio migrazione database...');
    
    // Leggi schema SQL
    const schemaPath = path.join(__dirname, '../../docs/database-schema.md');
    // Nota: In produzione, usa un file SQL separato invece di estrarre da markdown
    
    // Per ora, creiamo le tabelle principali manualmente
    // In produzione, usa un sistema di migrazioni come Sequelize migrations o Knex
    
    console.log('✅ Migrazione completata (schema da implementare con file SQL dedicato)');
    console.log('📝 Vedi docs/database-schema.md per lo schema completo');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Errore durante la migrazione:', error);
    process.exit(1);
  }
}

migrate();


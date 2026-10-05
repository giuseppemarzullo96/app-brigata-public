const fs = require('fs');
const path = require('path');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Script per eseguire le migration SQL
 * Uso: node src/database/run-migration.js <nome-file-migration>
 */

async function runMigration(migrationFile) {
  try {
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      logger.error(`File migration non trovato: ${migrationPath}`);
      process.exit(1);
    }

    logger.info(`Esecuzione migration: ${migrationFile}`);
    
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Rimuovi commenti SQL (-- commento)
    const sqlWithoutComments = sql
      .split('\n')
      .map(line => {
        const commentIndex = line.indexOf('--');
        return commentIndex >= 0 ? line.substring(0, commentIndex) : line;
      })
      .join('\n');
    
    // Dividi le query per statement (separate da ;)
    // Gestisci correttamente le query multi-linea
    const statements = sqlWithoutComments
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.match(/^\s*$/));
    
    // Esegui ogni statement separatamente
    for (const statement of statements) {
      if (statement.trim()) {
        const preview = statement.replace(/\s+/g, ' ').substring(0, 60);
        logger.info(`Esecuzione: ${preview}...`);
        try {
          await sequelize.query(statement);
        } catch (error) {
          // Se l'errore è "already exists" o "does not exist" per IF NOT EXISTS, ignora
          if (error.message && (
            error.message.includes('already exists') ||
            error.message.includes('does not exist') ||
            error.message.includes('duplicate')
          )) {
            logger.warn(`Query saltata (già eseguita o non applicabile): ${preview}`);
          } else {
            throw error;
          }
        }
      }
    }
    
    logger.info(`✅ Migration ${migrationFile} eseguita con successo!`);
    process.exit(0);
  } catch (error) {
    logger.error('Errore durante l\'esecuzione della migration:', error);
    process.exit(1);
  }
}

// Esegui migration se specificata come argomento
const migrationFile = process.argv[2];

if (!migrationFile) {
  logger.error('Specifica il file di migration da eseguire');
  logger.info('Uso: node src/database/run-migration.js <nome-file-migration>');
  logger.info('Esempio: node src/database/run-migration.js 001_add_ricettario_to_slot.sql');
  process.exit(1);
}

runMigration(migrationFile);


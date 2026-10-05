-- Migration: Aggiungi supporto per risposte multiple nei sondaggi
-- Data: 2025-11-07

-- Aggiungi campo per permettere più risposte
ALTER TABLE sondaggi
ADD COLUMN IF NOT EXISTS permetti_multiple_risposte BOOLEAN DEFAULT false;

-- Rimuovi il vincolo UNIQUE che impedisce più risposte per utente
-- Nota: Se il vincolo non esiste, questo genererà un warning ma non bloccherà l'esecuzione
ALTER TABLE risposte_sondaggio
DROP CONSTRAINT IF EXISTS risposte_sondaggio_sondaggio_id_user_id_key;

-- Aggiungi un indice composito per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_risposte_sondaggio_user ON risposte_sondaggio(sondaggio_id, user_id);

-- Commenti per documentazione
COMMENT ON COLUMN sondaggi.permetti_multiple_risposte IS 'Se true, l''utente può selezionare più opzioni di risposta';


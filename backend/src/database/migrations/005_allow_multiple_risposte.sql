-- Migration: Permetti risposte multiple nei sondaggi
-- Data: 2025-11-07

-- Rimuovi il vincolo UNIQUE che impedisce più risposte per utente
-- (permetteremo più risposte per sondaggi di tipo scelta_multipla_risposte)
ALTER TABLE risposte_sondaggio
DROP CONSTRAINT IF EXISTS risposte_sondaggio_sondaggio_id_user_id_key;

-- Aggiungi un indice composito per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_risposte_sondaggio_user ON risposte_sondaggio(sondaggio_id, user_id);

-- Commento per documentazione
COMMENT ON TABLE risposte_sondaggio IS 'Risposte ai sondaggi. Per sondaggi con scelta_multipla_risposte, un utente può avere più risposte.';


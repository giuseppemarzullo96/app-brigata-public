-- Migration: Aggiungi stato validazione alle quote associative
-- Data: 2026-01-08

-- Aggiungi campo per tracciare lo stato di validazione del pagamento
-- Stati: NULL (non segnalato), 'in_attesa' (utente ha segnalato pagamento), 'validato' (admin ha confermato), 'rifiutato' (admin ha rifiutato)
ALTER TABLE quote_associative
ADD COLUMN IF NOT EXISTS stato_validazione VARCHAR(50),
ADD COLUMN IF NOT EXISTS data_segnalazione TIMESTAMP,
ADD COLUMN IF NOT EXISTS validato_da UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS data_validazione TIMESTAMP,
ADD COLUMN IF NOT EXISTS motivo_rifiuto TEXT;

-- Crea indice per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_quote_stato_validazione ON quote_associative(stato_validazione);

-- Commenti per documentazione
COMMENT ON COLUMN quote_associative.stato_validazione IS 'Stato validazione: NULL, in_attesa, validato, rifiutato';
COMMENT ON COLUMN quote_associative.data_segnalazione IS 'Data in cui l''utente ha segnalato il pagamento';
COMMENT ON COLUMN quote_associative.validato_da IS 'Admin che ha validato/rifiutato il pagamento';
COMMENT ON COLUMN quote_associative.data_validazione IS 'Data della validazione/rifiuto';
COMMENT ON COLUMN quote_associative.motivo_rifiuto IS 'Motivo del rifiuto del pagamento';

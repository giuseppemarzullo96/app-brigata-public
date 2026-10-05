-- Migration: Aggiungi supporto per modifica ed eliminazione messaggi
-- Data: 2025-01-08

-- Aggiungi campi per modifica messaggi
ALTER TABLE messaggi_interni
ADD COLUMN IF NOT EXISTS modificato BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS data_modifica TIMESTAMP,
ADD COLUMN IF NOT EXISTS eliminato BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS data_eliminazione TIMESTAMP;

-- Indici per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_messaggi_modificati ON messaggi_interni(modificato) WHERE modificato = true;
CREATE INDEX IF NOT EXISTS idx_messaggi_eliminati ON messaggi_interni(eliminato) WHERE eliminato = true;

-- Commenti per documentazione
COMMENT ON COLUMN messaggi_interni.modificato IS 'Indica se il messaggio è stato modificato';
COMMENT ON COLUMN messaggi_interni.data_modifica IS 'Data e ora dell''ultima modifica';
COMMENT ON COLUMN messaggi_interni.eliminato IS 'Indica se il messaggio è stato eliminato (soft delete)';
COMMENT ON COLUMN messaggi_interni.data_eliminazione IS 'Data e ora dell''eliminazione';


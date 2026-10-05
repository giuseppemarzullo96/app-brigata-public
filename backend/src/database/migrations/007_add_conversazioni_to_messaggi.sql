-- Migration: Aggiungi supporto per conversazioni/thread nei messaggi
-- Data: 2025-11-07

-- Aggiungi campo conversazione_id per raggruppare i messaggi in thread
ALTER TABLE messaggi_interni
ADD COLUMN IF NOT EXISTS conversazione_id UUID;

-- Crea indice per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_messaggi_conversazione ON messaggi_interni(conversazione_id);

-- Commenti per documentazione
COMMENT ON COLUMN messaggi_interni.conversazione_id IS 'ID della conversazione/thread. Se NULL, è un messaggio singolo. Se presente, raggruppa i messaggi in una conversazione.';


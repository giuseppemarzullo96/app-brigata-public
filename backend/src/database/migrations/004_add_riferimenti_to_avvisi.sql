-- Migration: Aggiungi riferimenti a assemblee e sondaggi negli avvisi
-- Data: 2025-11-07

-- Aggiungi campi per riferimenti
ALTER TABLE avvisi
ADD COLUMN IF NOT EXISTS assemblea_id UUID REFERENCES assemblee(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS sondaggio_id UUID REFERENCES sondaggi(id) ON DELETE CASCADE;

-- Indici per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_avvisi_assemblea ON avvisi(assemblea_id);
CREATE INDEX IF NOT EXISTS idx_avvisi_sondaggio ON avvisi(sondaggio_id);

-- Commenti per documentazione
COMMENT ON COLUMN avvisi.assemblea_id IS 'Riferimento all''assemblea se l''avviso è collegato';
COMMENT ON COLUMN avvisi.sondaggio_id IS 'Riferimento al sondaggio se l''avviso è collegato';


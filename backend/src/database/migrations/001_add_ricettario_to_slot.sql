-- Migration: Aggiungi supporto ricette agli slot e ricettario globale
-- Data: 2025-11-07

-- 1. Aggiungi campo archiviato e globale a ricettari
ALTER TABLE ricettari 
ADD COLUMN IF NOT EXISTS archiviato BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS globale BOOLEAN DEFAULT false;

-- 2. Aggiorna ricette esistenti: se turno_id è NULL, sono globali
UPDATE ricettari 
SET globale = true 
WHERE turno_id IS NULL;

-- 3. Aggiungi ricettario_id a slot_turno
ALTER TABLE slot_turno 
ADD COLUMN IF NOT EXISTS ricettario_id UUID REFERENCES ricettari(id) ON DELETE SET NULL;

-- 4. Crea indice per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_slot_ricettario ON slot_turno(ricettario_id);
CREATE INDEX IF NOT EXISTS idx_ricettari_globale ON ricettari(globale, archiviato);
CREATE INDEX IF NOT EXISTS idx_ricettari_tipo ON ricettari(tipo_ricetta) WHERE tipo_ricetta IS NOT NULL;

-- 5. Aggiungi campo tipo_ricetta a ricettari per categorizzare (primi, secondi, dolci, etc.)
ALTER TABLE ricettari 
ADD COLUMN IF NOT EXISTS tipo_ricetta VARCHAR(50);

-- Commenti per documentazione
COMMENT ON COLUMN ricettari.globale IS 'Se true, la ricetta è nel ricettario globale e può essere riutilizzata';
COMMENT ON COLUMN ricettari.archiviato IS 'Se true, la ricetta è archiviata ma ancora disponibile';
COMMENT ON COLUMN ricettari.tipo_ricetta IS 'Categoria ricetta: primi, secondi, contorni, dolci, pane, acqua, altro';
COMMENT ON COLUMN slot_turno.ricettario_id IS 'Ricetta associata a questo slot';


-- Migration: Aggiungi campo convocazione_path a assemblee
-- Data: 2025-11-07

-- Aggiungi campo convocazione_path a assemblee
ALTER TABLE assemblee
ADD COLUMN IF NOT EXISTS convocazione_path VARCHAR(500);

-- Commenti per documentazione
COMMENT ON COLUMN assemblee.convocazione_path IS 'Path al file PDF della convocazione firmata';


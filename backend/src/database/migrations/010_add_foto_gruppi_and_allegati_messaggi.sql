-- Migration: Aggiungi foto profilo gruppi e supporto allegati ai messaggi
-- Data: 2025-01-08

-- Aggiungi foto_profilo ai gruppi
ALTER TABLE gruppi_chat
ADD COLUMN IF NOT EXISTS foto_profilo VARCHAR(500);

-- Aggiungi supporto allegati ai messaggi
ALTER TABLE messaggi_interni
ADD COLUMN IF NOT EXISTS tipo_allegato VARCHAR(50), -- 'immagine', 'audio', 'video', 'documento'
ADD COLUMN IF NOT EXISTS allegato_path VARCHAR(500),
ADD COLUMN IF NOT EXISTS allegato_nome VARCHAR(255),
ADD COLUMN IF NOT EXISTS allegato_dimensione INTEGER;

-- Crea indici
CREATE INDEX IF NOT EXISTS idx_messaggi_allegato ON messaggi_interni(tipo_allegato) WHERE tipo_allegato IS NOT NULL;

-- Commenti per documentazione
COMMENT ON COLUMN gruppi_chat.foto_profilo IS 'Path alla foto profilo del gruppo';
COMMENT ON COLUMN messaggi_interni.tipo_allegato IS 'Tipo di allegato: immagine, audio, video, documento';
COMMENT ON COLUMN messaggi_interni.allegato_path IS 'Path al file allegato';
COMMENT ON COLUMN messaggi_interni.allegato_nome IS 'Nome originale del file';
COMMENT ON COLUMN messaggi_interni.allegato_dimensione IS 'Dimensione file in bytes';


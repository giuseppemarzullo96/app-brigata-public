-- Migration: Aggiungi supporto per chat di gruppo e chat generale
-- Data: 2025-01-08

-- Tabella per i gruppi di chat
CREATE TABLE IF NOT EXISTS gruppi_chat (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    descrizione TEXT,
    tipo_gruppo VARCHAR(50) DEFAULT 'normale', -- 'normale', 'generale'
    creatore_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella per i partecipanti ai gruppi
CREATE TABLE IF NOT EXISTS partecipanti_gruppo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gruppo_id UUID NOT NULL REFERENCES gruppi_chat(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ruolo VARCHAR(50) DEFAULT 'membro', -- 'membro', 'admin'
    aggiunto_da UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(gruppo_id, user_id)
);

-- Aggiungi campo gruppo_id ai messaggi per supportare messaggi di gruppo
ALTER TABLE messaggi_interni
ADD COLUMN IF NOT EXISTS gruppo_id UUID REFERENCES gruppi_chat(id) ON DELETE CASCADE;

-- Crea indici per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_gruppi_tipo ON gruppi_chat(tipo_gruppo);
CREATE INDEX IF NOT EXISTS idx_partecipanti_gruppo ON partecipanti_gruppo(gruppo_id, user_id);
CREATE INDEX IF NOT EXISTS idx_messaggi_gruppo ON messaggi_interni(gruppo_id);

-- Crea chat generale (tutti possono vedere e scrivere)
-- Nota: Questo verrà creato manualmente o tramite seed
INSERT INTO gruppi_chat (id, nome, descrizione, tipo_gruppo, creatore_id)
SELECT 
    '00000000-0000-0000-0000-000000000001'::UUID,
    'Chat Generale',
    'Chat generale per tutti i membri dell''associazione',
    'generale',
    NULL
WHERE NOT EXISTS (
    SELECT 1 FROM gruppi_chat WHERE tipo_gruppo = 'generale'
);

-- Commenti per documentazione
COMMENT ON TABLE gruppi_chat IS 'Gruppi di chat per conversazioni di gruppo';
COMMENT ON TABLE partecipanti_gruppo IS 'Partecipanti ai gruppi di chat';
COMMENT ON COLUMN messaggi_interni.gruppo_id IS 'ID del gruppo se il messaggio è inviato a un gruppo';
COMMENT ON COLUMN gruppi_chat.tipo_gruppo IS 'Tipo di gruppo: normale (creato da utenti) o generale (per tutti)';


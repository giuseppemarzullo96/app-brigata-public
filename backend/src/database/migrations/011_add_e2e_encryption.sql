-- Migration: Aggiungi supporto per crittografia end-to-end delle chat
-- Data: 2025-01-08

-- Tabella per memorizzare le chiavi pubbliche degli utenti
CREATE TABLE IF NOT EXISTS chiavi_pubbliche (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    chiave_pubblica TEXT NOT NULL, -- Chiave pubblica in formato JSON Web Key (JWK)
    algoritmo VARCHAR(50) DEFAULT 'ECDH', -- 'ECDH' per Elliptic Curve Diffie-Hellman
    curva VARCHAR(50) DEFAULT 'P-256', -- Curva ellittica utilizzata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabella per memorizzare le chiavi condivise per le conversazioni
-- Questa tabella memorizza la chiave pubblica derivata per ogni coppia di utenti
CREATE TABLE IF NOT EXISTS chiavi_condivise (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversazione_id UUID, -- Se presente, è una conversazione privata
    gruppo_id UUID REFERENCES gruppi_chat(id) ON DELETE CASCADE, -- Se presente, è un gruppo
    chiave_derivata TEXT, -- Chiave derivata (opzionale, per cache)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user1_id, user2_id, conversazione_id, gruppo_id)
);

-- Aggiungi campo per indicare se un messaggio è crittografato
ALTER TABLE messaggi_interni
ADD COLUMN IF NOT EXISTS crittografato BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS iv VARCHAR(255), -- Initialization Vector per AES-GCM
ADD COLUMN IF NOT EXISTS chiave_ephemeral TEXT; -- Chiave pubblica ephemeral per ECDH

-- Indici per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_chiavi_pubbliche_user ON chiavi_pubbliche(user_id);
CREATE INDEX IF NOT EXISTS idx_chiavi_condivise_users ON chiavi_condivise(user1_id, user2_id);
CREATE INDEX IF NOT EXISTS idx_chiavi_condivise_conversazione ON chiavi_condivise(conversazione_id);
CREATE INDEX IF NOT EXISTS idx_chiavi_condivise_gruppo ON chiavi_condivise(gruppo_id);
CREATE INDEX IF NOT EXISTS idx_messaggi_crittografati ON messaggi_interni(crittografato) WHERE crittografato = true;

-- Commenti per documentazione
COMMENT ON TABLE chiavi_pubbliche IS 'Chiavi pubbliche degli utenti per crittografia end-to-end';
COMMENT ON TABLE chiavi_condivise IS 'Chiavi condivise derivate per conversazioni e gruppi';
COMMENT ON COLUMN messaggi_interni.crittografato IS 'Indica se il messaggio è crittografato end-to-end';
COMMENT ON COLUMN messaggi_interni.iv IS 'Initialization Vector per AES-GCM (Base64)';
COMMENT ON COLUMN messaggi_interni.chiave_ephemeral IS 'Chiave pubblica ephemeral per ECDH (JWK)';


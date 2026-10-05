-- Migration: Aggiungi tracciamento letture avvisi
-- Data: 2025-11-07

-- Tabella per tracciare le letture degli avvisi
CREATE TABLE IF NOT EXISTS avvisi_letture (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    avviso_id UUID NOT NULL REFERENCES avvisi(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data_lettura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(avviso_id, user_id)
);

-- Indici per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_avvisi_letture_avviso ON avvisi_letture(avviso_id);
CREATE INDEX IF NOT EXISTS idx_avvisi_letture_user ON avvisi_letture(user_id);
CREATE INDEX IF NOT EXISTS idx_avvisi_letture_data ON avvisi_letture(data_lettura);

-- Commenti per documentazione
COMMENT ON TABLE avvisi_letture IS 'Traccia le letture degli avvisi da parte degli utenti';
COMMENT ON COLUMN avvisi_letture.avviso_id IS 'Avviso letto';
COMMENT ON COLUMN avvisi_letture.user_id IS 'Utente che ha letto l''avviso';
COMMENT ON COLUMN avvisi_letture.data_lettura IS 'Data e ora della lettura';


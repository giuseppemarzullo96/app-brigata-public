-- Migration: Impostazioni configurabili dagli amministratori
-- Data: 2026-09-22
--
-- Prima l'importo della quota associativa era scritto nel codice in due punti
-- distinti: cambiarlo richiedeva una modifica e un rilascio, con il rischio di
-- aggiornarne uno solo. Qui diventa un valore in tabella, modificabile
-- dall'admin dall'interfaccia.

CREATE TABLE IF NOT EXISTS impostazioni (
    chiave VARCHAR(100) PRIMARY KEY,
    valore TEXT NOT NULL,
    descrizione TEXT,
    -- ON DELETE SET NULL: la rimozione di un utente non deve essere bloccata
    -- da una riga di configurazione che lo cita come ultimo modificatore.
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Valore iniziale allineato a quello finora in vigore, cosi' il comportamento
-- non cambia finche' un admin non decide diversamente.
INSERT INTO impostazioni (chiave, valore, descrizione)
VALUES (
    'quota_annuale',
    '15.00',
    'Importo in euro della quota associativa annuale, usato quando viene creata una nuova quota'
)
ON CONFLICT (chiave) DO NOTHING;

-- Storico delle variazioni: per un''associazione la quota e' una delibera, e
-- deve restare ricostruibile chi l''ha cambiata e quando.
CREATE TABLE IF NOT EXISTS impostazioni_storico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chiave VARCHAR(100) NOT NULL,
    valore_precedente TEXT,
    valore_nuovo TEXT NOT NULL,
    modificato_da UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_impostazioni_storico_chiave
    ON impostazioni_storico(chiave, created_at DESC);

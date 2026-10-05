-- Consiglio direttivo: cariche sociali e verbali delle sue riunioni.
-- Data: 2026-09-28
--
-- Fino a qui l'app non sapeva chi fosse nel Consiglio: le riunioni di tipo
-- "consiglio" erano visibili a tutti i soci e convocate come un'assemblea.
-- Con le cariche datate si sa chi e' in carica oggi e chi lo era alla data di
-- una riunione passata: i verbali restano leggibili a chi li ha deliberati
-- anche dopo la fine del mandato.

CREATE TABLE IF NOT EXISTS cariche_sociali (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Unico organo per ora; la colonna evita una migrazione se lo statuto
    -- introdurra' l'organo di controllo o quello di garanzia.
    organo VARCHAR(40) NOT NULL DEFAULT 'consiglio_direttivo'
        CHECK (organo IN ('consiglio_direttivo')),
    carica VARCHAR(20) NOT NULL DEFAULT 'consigliere'
        CHECK (carica IN ('presidente', 'vicepresidente', 'segretario', 'consigliere')),
    dal DATE NOT NULL,
    -- NULL = in carica. Si valorizza a fine mandato, dimissioni o revoca.
    al DATE,
    -- Votazione da cui deriva la nomina, se registrata dall'app.
    votazione_id UUID REFERENCES votazioni(id) ON DELETE SET NULL,
    note TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT carica_periodo_valido CHECK (al IS NULL OR al >= dal)
);

CREATE INDEX IF NOT EXISTS idx_cariche_sociali_user ON cariche_sociali(user_id, organo);
CREATE INDEX IF NOT EXISTS idx_cariche_sociali_periodo ON cariche_sociali(organo, dal, al);

-- Dati del verbale di una riunione del Consiglio: seduta, consiglieri presenti
-- (fotografati con nome e carica, perche' il verbale non deve cambiare se poi
-- cambiano le cariche) e delibere con l'esito del voto.
ALTER TABLE assemblee ADD COLUMN IF NOT EXISTS dati_verbale JSONB;

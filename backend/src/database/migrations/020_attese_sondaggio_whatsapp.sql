-- Lista d'attesa dei sondaggi WhatsApp.
--
-- Chi spunta un posto gia' preso da qualcun altro non resta a mani vuote per
-- sempre: entra in lista d'attesa per quel posto. Se chi l'aveva preso toglie
-- il voto, il posto passa al primo della lista, in ordine di arrivo del voto.
--
-- UNIQUE(opzione_id, user_id): una persona e' in lista una volta sola per lo
-- stesso posto, anche se WhatsApp ripete il voto a ogni ripensamento.

CREATE TABLE IF NOT EXISTS attese_sondaggio_whatsapp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sondaggio_id UUID NOT NULL REFERENCES sondaggi_whatsapp(id) ON DELETE CASCADE,
    opzione_id UUID NOT NULL REFERENCES opzioni_sondaggio_whatsapp(id) ON DELETE CASCADE,
    slot_id UUID NOT NULL REFERENCES slot_turno(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wa_lid VARCHAR(100),
    wa_telefono VARCHAR(50),
    created_at TIMESTAMP DEFAULT clock_timestamp(),
    UNIQUE (opzione_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_attese_wa_opzione ON attese_sondaggio_whatsapp(opzione_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attese_wa_utente ON attese_sondaggio_whatsapp(sondaggio_id, user_id);

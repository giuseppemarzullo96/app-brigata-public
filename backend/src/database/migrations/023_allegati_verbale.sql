-- Allegati al verbale d'assemblea o di riunione del Consiglio.
-- Data: 2026-09-28
--
-- La tabella allegati_assemblea esisteva ma nessuna API la usava. Diventa la
-- raccolta degli allegati del verbale (deleghe firmate, fogli firme, relazioni):
-- il verbale li elenca per titolo. Il titolo descrive il documento, il nome del
-- file resta quello originale per chi lo scarica.
ALTER TABLE allegati_assemblea ADD COLUMN IF NOT EXISTS titolo VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_allegati_assemblea ON allegati_assemblea(assemblea_id, created_at);

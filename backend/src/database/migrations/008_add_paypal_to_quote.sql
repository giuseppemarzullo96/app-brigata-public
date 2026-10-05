-- Migration: Aggiungi supporto PayPal alle quote associative
-- Data: 2025-01-08

-- Aggiungi campo per tracciare ordini PayPal
ALTER TABLE quote_associative
ADD COLUMN IF NOT EXISTS paypal_order_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS paypal_payment_id VARCHAR(255);

-- Crea indice per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_quote_paypal_order ON quote_associative(paypal_order_id);

-- Commenti per documentazione
COMMENT ON COLUMN quote_associative.paypal_order_id IS 'ID ordine PayPal per tracciare il pagamento';
COMMENT ON COLUMN quote_associative.paypal_payment_id IS 'ID pagamento PayPal confermato';


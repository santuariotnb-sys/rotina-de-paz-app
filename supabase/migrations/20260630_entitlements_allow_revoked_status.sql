-- Sprint 0 — Bug "revoke quebrado".
-- Causa-raiz: a UI de admin (src/routes/admin.acessos.tsx) grava status='revoked' ao
-- revogar um acesso, mas o CHECK original aceitava apenas
-- ('active','refunded','canceled','pending'). O UPDATE falhava com erro 23514
-- (violacao de check constraint) e — por nao haver onError na mutation — falhava em
-- silencio: o status permanecia 'active' e o usuario mantinha o acesso.
--
-- A coluna revoked_at e a acao de auditoria 'entitlement.revoke' ja existiam: a
-- intencao de ter um estado 'revoked' distinto sempre esteve no design; faltou
-- apenas incluir o valor no CHECK. 'canceled'/'refunded' permanecem reservados para
-- cancelamento/estorno (eventos Kirvano), preservando a fidelidade dos relatorios.
--
-- Mudanca segura: apenas amplia os valores permitidos. Nenhuma linha existente e
-- invalidada (todas usam active/refunded/canceled/pending).

ALTER TABLE public.entitlements DROP CONSTRAINT IF EXISTS entitlements_status_check;

ALTER TABLE public.entitlements
  ADD CONSTRAINT entitlements_status_check
  CHECK (status IN ('active', 'refunded', 'canceled', 'pending', 'revoked'));

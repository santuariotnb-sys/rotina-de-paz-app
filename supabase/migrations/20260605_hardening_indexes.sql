-- Migration: Indexes criados durante hardening (idempotente)

-- Rate limit: conta falhas de HMAC por IP (índice parcial, só signature_valid=false)
CREATE INDEX IF NOT EXISTS idx_webhook_logs_ip_invalid
  ON public.webhook_logs(request_ip, created_at)
  WHERE signature_valid = false;

-- Performance: ebooks por status + sort_order
CREATE INDEX IF NOT EXISTS idx_ebooks_status_sort
  ON public.ebooks(status, sort_order);

-- Performance: products por status
CREATE INDEX IF NOT EXISTS idx_products_status
  ON public.products(status);


ALTER TABLE public.products ADD COLUMN IF NOT EXISTS checkout_url text;
ALTER TABLE public.audio_tracks ADD COLUMN IF NOT EXISTS is_free_preview boolean NOT NULL DEFAULT false;

-- Refine read policy on audio_tracks: free preview OR entitlement OR admin
DROP POLICY IF EXISTS "auth read audio_tracks of active products" ON public.audio_tracks;
CREATE POLICY "auth read audio_tracks gated"
ON public.audio_tracks
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR is_free_preview = true
  OR EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = audio_tracks.product_id
      AND p.status = 'active'
      AND public.has_entitlement(p.id)
  )
);

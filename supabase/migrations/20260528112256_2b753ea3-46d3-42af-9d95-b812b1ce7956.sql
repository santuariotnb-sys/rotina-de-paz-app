
CREATE TABLE public.audio_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  day smallint NOT NULL CHECK (day BETWEEN 1 AND 31),
  kind text NOT NULL CHECK (kind IN ('despertar','aquietar','bonus')),
  title text NOT NULL,
  subtitle text,
  duration_seconds integer NOT NULL DEFAULT 0,
  audio_url text,
  transcript text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audio_tracks_product ON public.audio_tracks(product_id, day, kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audio_tracks TO authenticated;
GRANT ALL ON public.audio_tracks TO service_role;

ALTER TABLE public.audio_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage audio_tracks"
ON public.audio_tracks FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "auth read audio_tracks of active products"
ON public.audio_tracks FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = audio_tracks.product_id AND p.status = 'active'
  )
);

CREATE TRIGGER trg_audio_tracks_updated_at
BEFORE UPDATE ON public.audio_tracks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket público para os áudios
INSERT INTO storage.buckets (id, name, public)
VALUES ('method-audios', 'method-audios', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public read method-audios"
ON storage.objects FOR SELECT
USING (bucket_id = 'method-audios');

CREATE POLICY "admins upload method-audios"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'method-audios' AND is_admin(auth.uid()));

CREATE POLICY "admins update method-audios"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'method-audios' AND is_admin(auth.uid()));

CREATE POLICY "admins delete method-audios"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'method-audios' AND is_admin(auth.uid()));

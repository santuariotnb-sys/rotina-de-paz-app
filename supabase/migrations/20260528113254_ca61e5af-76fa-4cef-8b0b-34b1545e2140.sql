
-- ============ LOUVORES ============
CREATE TABLE public.louvores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book text NOT NULL,
  chapter_index integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  subtitle text,
  duration_seconds integer NOT NULL DEFAULT 0,
  audio_url text,
  is_bonus boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.louvores TO authenticated;
GRANT ALL ON public.louvores TO service_role;

ALTER TABLE public.louvores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage louvores"
  ON public.louvores FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "auth read louvores"
  ON public.louvores FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER trg_louvores_updated_at
  BEFORE UPDATE ON public.louvores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_louvores_book_sort ON public.louvores(book, sort_order, chapter_index);

-- ============ EBOOKS ============
CREATE TABLE public.ebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subtitle text,
  category text NOT NULL DEFAULT 'bonus' CHECK (category IN ('bonus','colecao','embreve')),
  price_cents integer NOT NULL DEFAULT 0,
  badge text,
  cover_url text,
  file_url text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ebooks TO authenticated;
GRANT ALL ON public.ebooks TO service_role;

ALTER TABLE public.ebooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage ebooks"
  ON public.ebooks FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "auth read active ebooks"
  ON public.ebooks FOR SELECT TO authenticated
  USING (status = 'active' OR is_admin(auth.uid()));

CREATE TRIGGER trg_ebooks_updated_at
  BEFORE UPDATE ON public.ebooks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_ebooks_category_sort ON public.ebooks(category, sort_order);

-- ============ COURSES ============
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  badge text,
  cover_url text,
  days smallint NOT NULL DEFAULT 0,
  modules smallint NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','draft','archived')),
  kind text NOT NULL DEFAULT 'devocional' CHECK (kind IN ('devocional','curso')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage courses"
  ON public.courses FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "auth read active courses"
  ON public.courses FOR SELECT TO authenticated
  USING (status = 'active' OR is_admin(auth.uid()));

CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ COURSE LESSONS ============
CREATE TABLE public.course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  module_index smallint NOT NULL DEFAULT 1,
  lesson_index smallint NOT NULL DEFAULT 1,
  title text NOT NULL,
  description text,
  video_url text,
  duration_seconds integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_lessons TO authenticated;
GRANT ALL ON public.course_lessons TO service_role;

ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage course_lessons"
  ON public.course_lessons FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "auth read lessons of active courses"
  ON public.course_lessons FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_lessons.course_id AND c.status = 'active'
    )
  );

CREATE TRIGGER trg_course_lessons_updated_at
  BEFORE UPDATE ON public.course_lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_course_lessons_course ON public.course_lessons(course_id, module_index, lesson_index);

-- ============ STORAGE BUCKETS ============
INSERT INTO storage.buckets (id, name, public) VALUES
  ('louvores-audios', 'louvores-audios', true),
  ('ebooks-files',    'ebooks-files',    true),
  ('course-videos',   'course-videos',   true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "public read louvores-audios"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'louvores-audios');

CREATE POLICY "public read ebooks-files"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'ebooks-files');

CREATE POLICY "public read course-videos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'course-videos');

-- Admin write/update/delete
CREATE POLICY "admins write louvores-audios"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'louvores-audios' AND is_admin(auth.uid()));
CREATE POLICY "admins update louvores-audios"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'louvores-audios' AND is_admin(auth.uid()));
CREATE POLICY "admins delete louvores-audios"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'louvores-audios' AND is_admin(auth.uid()));

CREATE POLICY "admins write ebooks-files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ebooks-files' AND is_admin(auth.uid()));
CREATE POLICY "admins update ebooks-files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ebooks-files' AND is_admin(auth.uid()));
CREATE POLICY "admins delete ebooks-files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ebooks-files' AND is_admin(auth.uid()));

CREATE POLICY "admins write course-videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'course-videos' AND is_admin(auth.uid()));
CREATE POLICY "admins update course-videos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'course-videos' AND is_admin(auth.uid()));
CREATE POLICY "admins delete course-videos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'course-videos' AND is_admin(auth.uid()));

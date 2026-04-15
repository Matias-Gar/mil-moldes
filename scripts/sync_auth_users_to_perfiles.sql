-- Sincroniza usuarios de auth.users a perfiles
INSERT INTO public.perfiles (id, email)
SELECT id, email FROM auth.users
WHERE id NOT IN (SELECT id FROM public.perfiles);

-- Hace que el campo email sea NOT NULL y único
ALTER TABLE public.perfiles ALTER COLUMN email SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS perfiles_email_idx ON public.perfiles(email);
-- Mục 3.1: "Có giới hạn tần suất gọi để chống lạm dụng."
--
-- The AI endpoints were already capped (DAILY_AI_LIMIT in lily.functions.ts,
-- which is the part the requirement calls out). The authentication endpoints
-- were not capped at all: signIn could be guessed against without limit, and
-- requestPasswordReset / resendVerification could be fired repeatedly to bomb
-- someone's inbox and burn the SMTP quota.
--
-- Fixed window, counted in one atomic INSERT .. ON CONFLICT so concurrent
-- requests cannot slip past the limit by reading a stale count first — the
-- same reason reserveUsage() in entitlements.server.ts is written this way.
-- Buckets hold a sha256 of the email, never the address itself, so failed
-- guesses against addresses that are not even registered leave no readable
-- trace here.

CREATE TABLE IF NOT EXISTS "auth_rate_limits" (
	"bucket" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- drizzle-kit never emits GRANTs (see db/0005_pronunciation_lessons_grants.sql
-- for the outage that caused). Only the server touches this, via withAdmin().
GRANT ALL ON TABLE "public"."auth_rate_limits" TO "lingora";--> statement-breakpoint
GRANT ALL ON TABLE "public"."auth_rate_limits" TO "service_role";--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_auth_rate_limits_window" ON "auth_rate_limits" ("window_start");--> statement-breakpoint

-- Returns true when this attempt is allowed. Rolls the window over when the
-- previous one has expired, so a quiet period always restores full allowance.
CREATE OR REPLACE FUNCTION public.auth_rate_take(_bucket text, _limit integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used integer;
BEGIN
  INSERT INTO public.auth_rate_limits AS r (bucket, window_start, attempts)
  VALUES (_bucket, now(), 1)
  ON CONFLICT (bucket) DO UPDATE
    SET attempts = CASE
          WHEN r.window_start < now() - make_interval(secs => _window_seconds) THEN 1
          ELSE r.attempts + 1
        END,
        window_start = CASE
          WHEN r.window_start < now() - make_interval(secs => _window_seconds) THEN now()
          ELSE r.window_start
        END
  RETURNING r.attempts INTO used;

  -- Opportunistic purge so attacker-supplied buckets cannot grow the table
  -- without bound. Cheap: roughly one scan per 100 calls, on an indexed column.
  IF random() < 0.01 THEN
    DELETE FROM public.auth_rate_limits WHERE window_start < now() - interval '1 day';
  END IF;

  RETURN used <= _limit;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.auth_rate_take(text, integer, integer) FROM public, anon, authenticated;

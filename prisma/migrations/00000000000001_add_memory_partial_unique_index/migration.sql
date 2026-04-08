-- Add partial unique index for org-scoped memories where user_id IS NULL.
-- PostgreSQL does not enforce uniqueness on NULLs in composite unique constraints,
-- so this index prevents duplicate org-level memories with the same key.
CREATE UNIQUE INDEX IF NOT EXISTS "memory_org_key_null_user"
  ON "agent"."memory" ("org_id", "key")
  WHERE "user_id" IS NULL;

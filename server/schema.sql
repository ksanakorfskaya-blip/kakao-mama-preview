CREATE TABLE IF NOT EXISTS family_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS family_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES family_users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS family_tokens_user ON family_tokens(user_id);
CREATE TABLE IF NOT EXISTS family_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES family_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS family_sessions_user ON family_sessions(user_id);
CREATE TABLE IF NOT EXISTS family_profiles (
  user_id UUID PRIMARY KEY REFERENCES family_users(id) ON DELETE CASCADE,
  content JSONB NOT NULL DEFAULT '{"parent":"","children":[],"selected":null,"demo":false}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS family_drawings (
  user_id UUID NOT NULL REFERENCES family_users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  day DATE NOT NULL,
  mime TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,id)
);
CREATE INDEX IF NOT EXISTS family_drawings_by_day ON family_drawings(user_id,child_id,day);

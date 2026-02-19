CREATE TABLE IF NOT EXISTS category_name (
  key text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

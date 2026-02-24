CREATE TABLE IF NOT EXISTS category_name (
  code VARCHAR(1) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO category_name (code, name) VALUES
  ('R', 'Royalty'),
  ('S', 'Statesmen'),
  ('P', 'Philosophers'),
  ('I', 'Inventors'),
  ('M', 'Mathematical Scientists'),
  ('N', 'Natural Scientists'),
  ('A', 'Artists'),
  ('B', 'Builders'),
  ('C', 'Composers'),
  ('D', 'Dramatists'),
  ('T', 'Towns')
ON CONFLICT (code) DO NOTHING;

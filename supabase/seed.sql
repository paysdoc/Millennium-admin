-- Create the character_images storage bucket (matches production)
INSERT INTO storage.buckets (id, name, public)
VALUES ('character_images', 'character_images', true)
ON CONFLICT (id) DO NOTHING;

-- Seed category_name table
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

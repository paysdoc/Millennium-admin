-- Migration: Create characters table for Millennium Admin
-- Description: Creates the characters table with proper schema, RLS policies, and sample data

-- Create the characters table
CREATE TABLE IF NOT EXISTS public.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('R', 'S', 'P', 'I', 'M', 'N', 'A', 'B', 'C', 'D', 'T')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for efficient category-based queries
CREATE INDEX IF NOT EXISTS idx_characters_category ON public.characters(category);

-- Create index for efficient name-based sorting
CREATE INDEX IF NOT EXISTS idx_characters_name ON public.characters(name);

-- Enable Row Level Security
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

-- Allow public read access (anon key can read all characters)
CREATE POLICY "Allow public read access" ON public.characters
  FOR SELECT USING (true);

-- Insert sample characters for each category
-- Category R
INSERT INTO public.characters (name, category) VALUES
  ('Alice', 'R'),
  ('Arthur', 'R'),
  ('Amanda', 'R');

-- Category S
INSERT INTO public.characters (name, category) VALUES
  ('Samuel', 'S'),
  ('Sarah', 'S'),
  ('Simon', 'S');

-- Category P
INSERT INTO public.characters (name, category) VALUES
  ('Patricia', 'P'),
  ('Paul', 'P'),
  ('Penelope', 'P');

-- Category I
INSERT INTO public.characters (name, category) VALUES
  ('Isaac', 'I'),
  ('Isabelle', 'I'),
  ('Ivan', 'I');

-- Category M
INSERT INTO public.characters (name, category) VALUES
  ('Michael', 'M'),
  ('Maria', 'M'),
  ('Marcus', 'M');

-- Category N
INSERT INTO public.characters (name, category) VALUES
  ('Nathan', 'N'),
  ('Natalie', 'N'),
  ('Noah', 'N');

-- Category A
INSERT INTO public.characters (name, category) VALUES
  ('Andrew', 'A'),
  ('Angela', 'A'),
  ('Adam', 'A');

-- Category B
INSERT INTO public.characters (name, category) VALUES
  ('Benjamin', 'B'),
  ('Beatrice', 'B'),
  ('Brian', 'B');

-- Category C
INSERT INTO public.characters (name, category) VALUES
  ('Catherine', 'C'),
  ('Charles', 'C'),
  ('Clara', 'C');

-- Category D
INSERT INTO public.characters (name, category) VALUES
  ('Daniel', 'D'),
  ('Diana', 'D'),
  ('David', 'D');

-- Category T
INSERT INTO public.characters (name, category) VALUES
  ('Thomas', 'T'),
  ('Theresa', 'T'),
  ('Timothy', 'T');

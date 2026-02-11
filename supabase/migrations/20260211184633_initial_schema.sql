-- profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text,
  display_name text,
  full_name text,
  bio text,
  email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- character table
CREATE TABLE IF NOT EXISTS character (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  first_names text,
  birth_date text,
  death_date text,
  biography text,
  type text NOT NULL,
  link text,
  image_link text
);

-- games table
CREATE TABLE IF NOT EXISTS games (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- connection table
CREATE TABLE IF NOT EXISTS connection (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  char1_id bigint NOT NULL REFERENCES character(id),
  char2_id bigint NOT NULL REFERENCES character(id),
  value integer,
  why text,
  why_short text,
  active boolean DEFAULT true
);

-- game_players table
CREATE TABLE IF NOT EXISTS game_players (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  game_id bigint NOT NULL REFERENCES games(id),
  player_id uuid NOT NULL REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

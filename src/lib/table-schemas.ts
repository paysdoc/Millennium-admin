/**
 * SQL CREATE TABLE statements for all synced tables.
 * Used for auto-creating tables on staging when they don't exist.
 *
 * NOTE: These schemas should be kept in sync with the production database.
 * When the production schema changes, update these definitions accordingly.
 */

export const TABLE_SCHEMAS: Record<string, string> = {
  character: `
    CREATE TABLE IF NOT EXISTS public.character (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      first_names TEXT,
      birth_date TEXT,
      death_date TEXT,
      biography TEXT,
      type TEXT NOT NULL,
      link TEXT,
      image_link TEXT
    );
  `,

  connection: `
    CREATE TABLE IF NOT EXISTS public.connection (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      char1_id UUID NOT NULL REFERENCES public.character(id),
      char2_id UUID NOT NULL REFERENCES public.character(id),
      value INTEGER,
      why TEXT,
      why_short TEXT,
      active BOOLEAN DEFAULT true
    );
  `,

  game_players: `
    CREATE TABLE IF NOT EXISTS public.game_players (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      game_id UUID NOT NULL,
      player_id UUID NOT NULL,
      score INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `,

  games: `
    CREATE TABLE IF NOT EXISTS public.games (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT now(),
      ended_at TIMESTAMPTZ
    );
  `,

  profiles: `
    CREATE TABLE IF NOT EXISTS public.profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID UNIQUE,
      username TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `,
}

/**
 * Get the CREATE TABLE SQL statement for a given table name.
 * @param tableName - The name of the table
 * @returns The SQL statement or undefined if the table is not defined
 */
export function getCreateTableSQL(tableName: string): string | undefined {
  return TABLE_SCHEMAS[tableName]
}

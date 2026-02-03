/**
 * Connection interface matching the `connection` database table schema.
 * Represents a relationship between two characters.
 */
export interface Connection {
  id: string
  char1_id: string
  char2_id: string
  value: number | null
  why: string | null
  why_short: string | null
  active: boolean
}

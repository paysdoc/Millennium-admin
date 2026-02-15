import Link from 'next/link'
import { Connection } from '@/types/connection'
import { Character, CATEGORY_ORDER } from '@/types/character'

interface ConnectionsTableProps {
  connections: Connection[]
  characterId: string
  allCharacters: Character[]
}

interface ConnectionWithCharacter {
  connection: Connection
  connectedCharacter: Character | undefined
}

/**
 * Get the other character in a connection (the one that is not the current character).
 */
function getConnectedCharacter(
  connection: Connection,
  characterId: string,
  allCharacters: Character[]
): Character | undefined {
  const otherId = connection.char1_id === characterId ? connection.char2_id : connection.char1_id
  return allCharacters.find((c) => c.id === otherId)
}

export default function ConnectionsTable({
  connections,
  characterId,
  allCharacters,
}: ConnectionsTableProps) {
  if (connections.length === 0) {
    return (
      <div className="empty-state">
        <p>No connections found for this character.</p>
      </div>
    )
  }

  // Pre-compute connected characters to avoid redundant lookups during sort and render
  const connectionsWithCharacters: ConnectionWithCharacter[] = connections.map((connection) => ({
    connection,
    connectedCharacter: getConnectedCharacter(connection, characterId, allCharacters),
  }))

  // Sort connections by category (using CATEGORY_ORDER), then by name alphabetically
  const sorted = [...connectionsWithCharacters].sort((a, b) => {
    const charA = a.connectedCharacter
    const charB = b.connectedCharacter

    // Handle edge cases where connected character is not found (place at end)
    if (!charA && !charB) return 0
    if (!charA) return 1
    if (!charB) return -1

    // Sort by category using CATEGORY_ORDER index
    const categoryIndexA = CATEGORY_ORDER.indexOf(
      charA.category as (typeof CATEGORY_ORDER)[number]
    )
    const categoryIndexB = CATEGORY_ORDER.indexOf(
      charB.category as (typeof CATEGORY_ORDER)[number]
    )
    // Categories not in CATEGORY_ORDER go to the end
    const effectiveIndexA = categoryIndexA === -1 ? CATEGORY_ORDER.length : categoryIndexA
    const effectiveIndexB = categoryIndexB === -1 ? CATEGORY_ORDER.length : categoryIndexB

    if (effectiveIndexA !== effectiveIndexB) {
      return effectiveIndexA - effectiveIndexB
    }

    // Then sort by name alphabetically
    return charA.name.localeCompare(charB.name)
  })

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Name</th>
          <th>Value</th>
          <th>Description</th>
          <th>Shorthand</th>
          <th>Active</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(({ connection, connectedCharacter }) => (
          <tr key={connection.id}>
            <td>{connectedCharacter?.category ?? '-'}</td>
            <td>
              {connectedCharacter ? (
                <Link href={`/characters/${connectedCharacter.id}`}>
                  {connectedCharacter.name}
                </Link>
              ) : (
                <span className="unknown-character">Unknown</span>
              )}
            </td>
            <td>{connection.value ?? '-'}</td>
            <td>{connection.why ?? '-'}</td>
            <td>{connection.why_short ?? '-'}</td>
            <td>
              <span
                className={
                  connection.active ? 'status-active' : 'status-inactive'
                }
              >
                {connection.active ? 'Yes' : 'No'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

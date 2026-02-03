import Link from 'next/link'
import { Connection } from '@/types/connection'
import { Character } from '@/types/character'

interface ConnectionsTableProps {
  connections: Connection[]
  characterId: string
  allCharacters: Character[]
}

/**
 * Get the other character in a connection (the one that is not the current character).
 */
function getConnectedCharacter(
  connection: Connection,
  characterId: string,
  allCharacters: Character[]
): Character | undefined {
  const otherId =
    connection.char1_id === characterId
      ? connection.char2_id
      : connection.char1_id
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

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Connected Character</th>
          <th>Value</th>
          <th>Description</th>
          <th>Shorthand</th>
          <th>Active</th>
        </tr>
      </thead>
      <tbody>
        {connections.map((connection) => {
          const connectedCharacter = getConnectedCharacter(
            connection,
            characterId,
            allCharacters
          )
          return (
            <tr key={connection.id}>
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
          )
        })}
      </tbody>
    </table>
  )
}

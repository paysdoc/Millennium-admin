import { useMemo } from 'react'
import Link from 'next/link'
import { Connection } from '@/types/connection'
import { Character } from '@/types/character'
import { compareByCategoryThenName } from '@/lib/categoryUtils'

interface ConnectionsTableProps {
  connections: Connection[]
  characterId: string
  allCharacters: Character[]
}

export default function ConnectionsTable({
  connections,
  characterId,
  allCharacters,
}: ConnectionsTableProps) {
  // Precompute a lookup map for O(1) character resolution
  const characterLookup = useMemo(() =>
    new Map(allCharacters.map((c) => [String(c.id), c]))
  , [allCharacters])

  const getConnectedCharacter = (connection: Connection): Character | undefined => {
    const charIdStr = String(characterId)
    const otherId = String(connection.char1_id) === charIdStr
      ? connection.char2_id
      : connection.char1_id
    return characterLookup.get(String(otherId))
  }

  if (connections.length === 0) {
    return (
      <div className="empty-state">
        <p>No connections found for this character.</p>
      </div>
    )
  }

  const sortedConnections = [...connections].sort((a, b) => {
    const charA = getConnectedCharacter(a)
    const charB = getConnectedCharacter(b)

    if (!charA && !charB) return 0
    if (!charA) return 1
    if (!charB) return -1

    return compareByCategoryThenName(charA, charB)
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
        {sortedConnections.map((connection) => {
          const connectedCharacter = getConnectedCharacter(connection)
          return (
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
                <span className={connection.active ? 'status-active' : 'status-inactive'}>
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

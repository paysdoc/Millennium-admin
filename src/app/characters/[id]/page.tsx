import Link from 'next/link'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import EditableCharacterDetails from '@/components/EditableCharacterDetails'
import ConnectionsTable from '@/components/ConnectionsTable'
import { fetchCharacterById, fetchAllCharacters } from '@/lib/characters'
import { fetchConnectionsByCharacter } from '@/lib/connections'

interface CharacterPageProps {
  params: Promise<{ id: string }>
}

export default async function CharacterPage({ params }: CharacterPageProps) {
  const { id } = await params

  const [character, connections, allCharacters] = await Promise.all([
    fetchCharacterById(id),
    fetchConnectionsByCharacter(id),
    fetchAllCharacters(),
  ])

  if (!character) {
    return (
      <div id="top">
        <Header />
        <div className="container">
          <main className="main-content">
            <h1 className="page-title">Character Not Found</h1>
            <div className="empty-state">
              <p>The character you are looking for does not exist.</p>
              <p>
                <Link href="/">Back to Overview</Link>
              </p>
            </div>
          </main>
          <Footer />
        </div>
      </div>
    )
  }

  return (
    <div id="top">
      <Header />
      <div className="container">
        <main className="main-content">
          <p className="back-to-overview">
            <Link href="/">← Back to Overview</Link>
          </p>

          <h1 className="page-title">{character.name}</h1>

          <div className="character-detail">
            <section className="detail-section">
              <h2 className="section-heading">Character Information</h2>
              <EditableCharacterDetails character={character} />
            </section>

            <section className="detail-section">
              <h2 className="section-heading">Connections</h2>
              <ConnectionsTable
                connections={connections}
                characterId={id}
                allCharacters={allCharacters}
              />
            </section>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  )
}

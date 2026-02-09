import Header from '@/components/Header'
import Footer from '@/components/Footer'
import TableOfContents from '@/components/TableOfContents'
import CategorySection from '@/components/CategorySection'
import { fetchAllCharacters, groupCharactersByCategory } from '@/lib/characters'
import { CharactersByCategory } from '@/types/character'

export const dynamic = 'force-dynamic'

export default async function Home() {
  let groupedCharacters: CharactersByCategory
  let error: string | null = null

  try {
    const characters = await fetchAllCharacters()
    groupedCharacters = groupCharactersByCategory(characters)
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load characters'
    groupedCharacters = new Map()
  }

  const categories = Array.from(groupedCharacters.keys())

  return (
    <div id="top">
      <Header />

      <div className="container">
        <main className="main-content">
          <h1 className="page-title">Millennium Characters Overview</h1>

          {error ? (
            <div className="empty-state">
              <p>Error loading characters: {error}</p>
            </div>
          ) : categories.length === 0 ? (
            <div className="empty-state">
              <p>No characters found.</p>
            </div>
          ) : (
            <>
              <TableOfContents categories={categories} />

              <div className="overview-content">
                {categories.map((category) => (
                  <CategorySection
                    key={category}
                    category={category}
                    characters={groupedCharacters.get(category) || []}
                  />
                ))}
              </div>
            </>
          )}
        </main>

        <Footer />
      </div>
    </div>
  )
}

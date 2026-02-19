import Header from '@/components/Header'
import Footer from '@/components/Footer'
import TableOfContents from '@/components/TableOfContents'
import CategorySection from '@/components/CategorySection'
import { fetchAllCharacters, groupCharactersByCategory } from '@/lib/characters'
import { fetchCategoryNames, getCategoryDisplayName } from '@/lib/categoryNames'
import { CategoryKey, CharactersByCategory } from '@/types/character'

export default async function Home() {
  let groupedCharacters: CharactersByCategory
  let categoryNames: Map<CategoryKey, string>
  let error: string | null = null

  try {
    const [characters, fetchedCategoryNames] = await Promise.all([
      fetchAllCharacters(),
      fetchCategoryNames(),
    ])
    groupedCharacters = groupCharactersByCategory(characters)
    categoryNames = fetchedCategoryNames
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load characters'
    groupedCharacters = new Map()
    categoryNames = new Map()
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
              <TableOfContents categories={categories} categoryNames={categoryNames} />

              <div className="overview-content">
                {categories.map((category) => (
                  <CategorySection
                    key={category}
                    category={category}
                    categoryName={getCategoryDisplayName(category, categoryNames)}
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

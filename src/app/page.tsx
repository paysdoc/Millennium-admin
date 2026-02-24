import Header from '@/components/Header'
import Footer from '@/components/Footer'
import TableOfContents from '@/components/TableOfContents'
import CategorySection from '@/components/CategorySection'
import { fetchAllCharacters, groupCharactersByCategory } from '@/lib/characters'
import { fetchAllCategoryNames, buildCategoryNameMap } from '@/lib/categories'
import { CharactersByCategory } from '@/types/character'
import { CategoryNameMap } from '@/types/categoryName'

export default async function Home() {
  let groupedCharacters: CharactersByCategory
  let categoryNameMap: CategoryNameMap = new Map()
  let error: string | null = null

  try {
    const [characters, categoryNames] = await Promise.all([
      fetchAllCharacters(),
      fetchAllCategoryNames(),
    ])
    groupedCharacters = groupCharactersByCategory(characters)
    categoryNameMap = buildCategoryNameMap(categoryNames)
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
              <TableOfContents categories={categories} categoryNames={categoryNameMap} />

              <div className="overview-content">
                {categories.map((category) => (
                  <CategorySection
                    key={category}
                    category={category}
                    characters={groupedCharacters.get(category) || []}
                    categoryName={categoryNameMap.get(category)}
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

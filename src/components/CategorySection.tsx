import Link from 'next/link'
import { Character, CategoryKey } from '@/types/character'

interface CategorySectionProps {
  category: CategoryKey
  categoryName: string
  characters: Character[]
}

export default function CategorySection({
  category,
  categoryName,
  characters,
}: CategorySectionProps) {
  return (
    <section className="category-section" id={`category-${category}`}>
      <h2 className="category-heading">{categoryName}</h2>
      <ul className="character-list">
        {characters.map((character) => (
          <li key={character.id} className="character-item">
            <Link href={`/characters/${character.id}`} className="character-link">
              {character.name}
            </Link>
          </li>
        ))}
      </ul>
      <p className="back-to-top">
        <a href="#top">Back to top</a>
      </p>
    </section>
  )
}

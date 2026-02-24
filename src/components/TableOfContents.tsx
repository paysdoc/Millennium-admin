import { CategoryKey } from '@/types/character'
import { CategoryNameMap } from '@/types/categoryName'

interface TableOfContentsProps {
  categories: CategoryKey[]
  categoryNames: CategoryNameMap
}

export default function TableOfContents({ categories, categoryNames }: TableOfContentsProps) {
  return (
    <div className="toc">
      <div className="toc-title">Contents</div>
      <ol className="toc-list">
        {categories.map((category, index) => (
          <li key={category}>
            <a href={`#category-${category}`}>
              {index + 1} {categoryNames.get(category) ?? category}
            </a>
          </li>
        ))}
      </ol>
    </div>
  )
}

import { CategoryKey } from '@/types/character'

interface TableOfContentsProps {
  categories: CategoryKey[]
}

export default function TableOfContents({ categories }: TableOfContentsProps) {
  return (
    <div className="toc">
      <div className="toc-title">Contents</div>
      <ol className="toc-list">
        {categories.map((category, index) => (
          <li key={category}>
            <a href={`#category-${category}`}>
              {index + 1} Category {category}
            </a>
          </li>
        ))}
      </ol>
    </div>
  )
}

import { Character } from '@/types/character'

interface CharacterDetailsProps {
  character: Character
}

export default function CharacterDetails({ character }: CharacterDetailsProps) {
  return (
    <div className="infobox">
      <h2 className="infobox-title">{character.name}</h2>

      <div className="infobox-content">
        {character.first_names && (
          <div className="infobox-row">
            <span className="infobox-label">First Names</span>
            <span className="infobox-value">{character.first_names}</span>
          </div>
        )}

        {character.birth_date && (
          <div className="infobox-row">
            <span className="infobox-label">Birth Date</span>
            <span className="infobox-value">{character.birth_date}</span>
          </div>
        )}

        {character.death_date && (
          <div className="infobox-row">
            <span className="infobox-label">Death Date</span>
            <span className="infobox-value">{character.death_date}</span>
          </div>
        )}

        <div className="infobox-row">
          <span className="infobox-label">Category</span>
          <span className="infobox-value">{character.category}</span>
        </div>

        {character.link && (
          <div className="infobox-row">
            <span className="infobox-label">External Link</span>
            <span className="infobox-value">
              <a
                href={character.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                {character.link}
              </a>
            </span>
          </div>
        )}

        {character.biography && (
          <div className="infobox-row infobox-row-full">
            <span className="infobox-label">Biography</span>
            <span className="infobox-value infobox-biography">
              {character.biography}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

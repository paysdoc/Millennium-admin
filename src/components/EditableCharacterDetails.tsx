'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Character } from '@/types/character'
import EditableField from './EditableField'

interface EditableCharacterDetailsProps {
  character: Character
  onSave?: (updated: Character) => void
}

type EditableFields = Pick<
  Character,
  'first_names' | 'birth_date' | 'death_date' | 'category' | 'link' | 'biography'
>

export default function EditableCharacterDetails({
  character,
  onSave,
}: EditableCharacterDetailsProps) {
  const originalData = useRef<EditableFields>({
    first_names: character.first_names,
    birth_date: character.birth_date,
    death_date: character.death_date,
    category: character.category,
    link: character.link,
    biography: character.biography,
  })

  const [fields, setFields] = useState<EditableFields>({ ...originalData.current })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasChanges = Object.keys(fields).some(
    (key) => fields[key as keyof EditableFields] !== originalData.current[key as keyof EditableFields]
  )

  const handleFieldChange = (fieldName: keyof EditableFields) => (value: string | null) => {
    setFields((prev) => ({ ...prev, [fieldName]: value }))
    setError(null)
  }

  const handleCancel = () => {
    setFields({ ...originalData.current })
    setError(null)
  }

  const handleApply = async () => {
    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/characters/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save changes')
      }

      const updatedCharacter: Character = await response.json()
      originalData.current = { ...fields }
      onSave?.(updatedCharacter)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="infobox">
      <h2 className="infobox-title">{character.name}</h2>

      {character.image_link && (
        <div className="infobox-image">
          <Image
            src={character.image_link}
            alt={character.name}
            className="character-image"
            width={280}
            height={280}
            style={{ objectFit: 'contain' }}
            unoptimized
          />
        </div>
      )}

      <div className="infobox-content">
        <div className="infobox-row">
          <span className="infobox-label">First Names</span>
          <span className="infobox-value">
            <EditableField
              value={fields.first_names}
              onChange={handleFieldChange('first_names')}
              label="First Names"
              fieldName="first_names"
            />
          </span>
        </div>

        <div className="infobox-row">
          <span className="infobox-label">Birth Date</span>
          <span className="infobox-value">
            <EditableField
              value={fields.birth_date}
              onChange={handleFieldChange('birth_date')}
              label="Birth Date"
              fieldName="birth_date"
            />
          </span>
        </div>

        <div className="infobox-row">
          <span className="infobox-label">Death Date</span>
          <span className="infobox-value">
            <EditableField
              value={fields.death_date}
              onChange={handleFieldChange('death_date')}
              label="Death Date"
              fieldName="death_date"
            />
          </span>
        </div>

        <div className="infobox-row">
          <span className="infobox-label">Category</span>
          <span className="infobox-value">
            <EditableField
              value={fields.category}
              onChange={handleFieldChange('category')}
              label="Category"
              fieldName="category"
              type="select"
            />
          </span>
        </div>

        <div className="infobox-row">
          <span className="infobox-label">External Link</span>
          <span className="infobox-value">
            <EditableField
              value={fields.link}
              onChange={handleFieldChange('link')}
              label="External Link"
              fieldName="link"
              placeholder="No link"
            />
          </span>
        </div>

        <div className="infobox-row infobox-row-full">
          <span className="infobox-label">Biography</span>
          <span className="infobox-value infobox-biography">
            <EditableField
              value={fields.biography}
              onChange={handleFieldChange('biography')}
              label="Biography"
              fieldName="biography"
              type="textarea"
              placeholder="No biography"
            />
          </span>
        </div>
      </div>

      {(hasChanges || error) && (
        <div className="infobox-actions">
          {error && <div className="infobox-error">{error}</div>}
          <div className="infobox-buttons">
            <button className="button button-secondary" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </button>
            <button className="button" onClick={handleApply} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Apply'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

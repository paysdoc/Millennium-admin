'use client'

import { useState, useRef } from 'react'
import { Character } from '@/types/character'
import InfoboxRow from './InfoboxRow'

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

      <div className="infobox-content">
        <InfoboxRow label="First Names" fieldName="first_names" value={fields.first_names} onChange={handleFieldChange('first_names')} />
        <InfoboxRow label="Birth Date" fieldName="birth_date" value={fields.birth_date} onChange={handleFieldChange('birth_date')} />
        <InfoboxRow label="Death Date" fieldName="death_date" value={fields.death_date} onChange={handleFieldChange('death_date')} />
        <InfoboxRow label="Category" fieldName="category" value={fields.category} onChange={handleFieldChange('category')} type="select" />
        <InfoboxRow label="External Link" fieldName="link" value={fields.link} onChange={handleFieldChange('link')} placeholder="No link" />
        <InfoboxRow label="Biography" fieldName="biography" value={fields.biography} onChange={handleFieldChange('biography')} type="textarea" placeholder="No biography" fullWidth />
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

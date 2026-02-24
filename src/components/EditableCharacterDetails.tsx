'use client'

import { useState, useRef } from 'react'
import { Character } from '@/types/character'
import EditableField from './EditableField'

interface EditableCharacterDetailsProps {
  character: Character
  categoryNames?: Record<string, string>
  onSave?: (updated: Character) => void
}

type EditableFields = Pick<
  Character,
  'first_names' | 'birth_date' | 'death_date' | 'category' | 'link' | 'biography'
>

type FieldType = 'text' | 'textarea' | 'select'

interface FieldConfig {
  label: string
  fieldName: keyof EditableFields
  type?: FieldType
  placeholder?: string
  fullWidth?: boolean
}

const EDITABLE_FIELDS: FieldConfig[] = [
  { label: 'First Names', fieldName: 'first_names' },
  { label: 'Birth Date', fieldName: 'birth_date' },
  { label: 'Death Date', fieldName: 'death_date' },
  { label: 'Category', fieldName: 'category', type: 'select' },
  { label: 'External Link', fieldName: 'link', placeholder: 'No link' },
  { label: 'Biography', fieldName: 'biography', type: 'textarea', placeholder: 'No biography', fullWidth: true },
]

export default function EditableCharacterDetails({
  character,
  categoryNames,
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

  const fieldsRef = useRef<EditableFields>({ ...originalData.current })
  const [fields, setFields] = useState<EditableFields>({ ...originalData.current })
  const [isSaving, setIsSaving] = useState(false)
  const isSavingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const hasChanges = Object.keys(fields).some(
    (key) => fields[key as keyof EditableFields] !== originalData.current[key as keyof EditableFields]
  )

  const handleFieldChange = (fieldName: keyof EditableFields) => (value: string | null) => {
    fieldsRef.current = { ...fieldsRef.current, [fieldName]: value }
    setFields({ ...fieldsRef.current })
    setError(null)
  }

  const handleCancel = () => {
    fieldsRef.current = { ...originalData.current }
    setFields({ ...originalData.current })
    setError(null)
  }

  const handleApply = async () => {
    if (isSavingRef.current) return
    isSavingRef.current = true
    setIsSaving(true)
    setError(null)

    const currentFields = fieldsRef.current

    try {
      const response = await fetch(`/api/characters/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentFields),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save changes')
      }

      const updatedCharacter: Character = await response.json()
      originalData.current = { ...currentFields }
      onSave?.(updatedCharacter)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setIsSaving(false)
      isSavingRef.current = false
    }
  }

  return (
    <div className="infobox">
      <h2 className="infobox-title">{character.name}</h2>

      <div className="infobox-content">
        {EDITABLE_FIELDS.map(({ label, fieldName, type, placeholder, fullWidth }) => (
          <div key={fieldName} className={`infobox-row${fullWidth ? ' infobox-row-full' : ''}`}>
            <span className="infobox-label">{label}</span>
            <span className={`infobox-value${fullWidth ? ' infobox-biography' : ''}`}>
              <EditableField
                value={fields[fieldName]}
                onChange={handleFieldChange(fieldName)}
                label={label}
                fieldName={fieldName}
                {...(type ? { type } : {})}
                {...(placeholder ? { placeholder } : {})}
                {...(fieldName === 'category' && categoryNames ? { optionLabels: categoryNames } : {})}
              />
            </span>
          </div>
        ))}
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

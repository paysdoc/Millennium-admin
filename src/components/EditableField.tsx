'use client'

import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent } from 'react'
import { CATEGORY_ORDER } from '@/types/character'

type FieldType = 'text' | 'textarea' | 'select'

interface EditableFieldProps {
  value: string | null
  onChange: (value: string | null) => void
  label: string
  fieldName: string
  type?: FieldType
  placeholder?: string
  optionLabels?: Record<string, string>
}

export default function EditableField({
  value,
  onChange,
  label,
  fieldName,
  type = 'text',
  placeholder = 'Click to edit',
  optionLabels,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [localValue, setLocalValue] = useState(value ?? '')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)

  useEffect(() => {
    setLocalValue(value ?? '')
  }, [value])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      if (inputRef.current instanceof HTMLInputElement || inputRef.current instanceof HTMLTextAreaElement) {
        inputRef.current.select()
      }
    }
  }, [isEditing])

  const handleClick = () => {
    setIsEditing(true)
  }

  const handleBlur = () => {
    setIsEditing(false)
    const newValue = localValue.trim() || null
    onChange(newValue)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault()
      handleBlur()
    } else if (e.key === 'Escape') {
      setLocalValue(value ?? '')
      setIsEditing(false)
    }
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setLocalValue(e.target.value)
  }

  const handleSelectChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setLocalValue(e.target.value)
    onChange(e.target.value || null)
    setIsEditing(false)
  }

  if (isEditing) {
    const className = 'editable-field-editing'

    if (type === 'textarea') {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`form-textarea ${className}`}
          placeholder={placeholder}
          aria-label={label}
          data-field={fieldName}
        />
      )
    }

    if (type === 'select') {
      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={localValue}
          onChange={handleSelectChange}
          onBlur={handleBlur}
          className={`form-select ${className}`}
          aria-label={label}
          data-field={fieldName}
        >
          {CATEGORY_ORDER.map((cat) => (
            <option key={cat} value={cat}>
              {optionLabels?.[cat] ?? cat}
            </option>
          ))}
        </select>
      )
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`form-input ${className}`}
        placeholder={placeholder}
        aria-label={label}
        data-field={fieldName}
      />
    )
  }

  const displayValue = value ?? ''
  const resolvedDisplayValue = optionLabels?.[displayValue] ?? displayValue

  return (
    <span
      className="editable-field"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      aria-label={`Edit ${label}`}
      data-field={fieldName}
    >
      {resolvedDisplayValue || <span className="editable-field-placeholder">{placeholder}</span>}
    </span>
  )
}

import EditableField from './EditableField'

type FieldType = 'text' | 'textarea' | 'select'

interface InfoboxRowProps {
  label: string
  fieldName: string
  value: string | null
  onChange: (value: string | null) => void
  type?: FieldType
  placeholder?: string
  fullWidth?: boolean
}

export default function InfoboxRow({
  label,
  fieldName,
  value,
  onChange,
  type = 'text',
  placeholder,
  fullWidth = false,
}: InfoboxRowProps) {
  const rowClass = fullWidth ? 'infobox-row infobox-row-full' : 'infobox-row'
  const valueClass = fullWidth ? 'infobox-value infobox-biography' : 'infobox-value'

  return (
    <div className={rowClass}>
      <span className="infobox-label">{label}</span>
      <span className={valueClass}>
        <EditableField
          value={value}
          onChange={onChange}
          label={label}
          fieldName={fieldName}
          type={type}
          placeholder={placeholder}
        />
      </span>
    </div>
  )
}

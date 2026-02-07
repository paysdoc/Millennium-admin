import Image from 'next/image'

interface CharacterImageProps {
  imageUrl: string | null
  characterName: string
}

export default function CharacterImage({
  imageUrl,
  characterName,
}: CharacterImageProps) {
  if (!imageUrl) {
    return null
  }

  return (
    <div className="character-image-container">
      <Image
        src={imageUrl}
        alt={characterName}
        className="character-detail-image"
        width={450}
        height={450}
        style={{ objectFit: 'contain' }}
        unoptimized
      />
    </div>
  )
}

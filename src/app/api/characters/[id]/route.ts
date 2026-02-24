import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { updateCharacter } from '@/lib/characters'
import { Character } from '@/types/character'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const { id } = await params
  let updateData: Partial<Omit<Character, 'id'>> = {}

  try {
    const body = await request.json()

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      )
    }

    // Validate that only allowed fields are being updated
    const allowedFields: (keyof Omit<Character, 'id'>)[] = [
      'name',
      'first_names',
      'birth_date',
      'death_date',
      'biography',
      'category',
      'link',
      'image_link',
    ]

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    const updatedCharacter = await updateCharacter(id, updateData)
    revalidatePath(`/characters/${id}`)
    revalidatePath('/')
    return NextResponse.json(updatedCharacter)
  } catch (error) {
    if (error instanceof Error && error.message === 'Character not found') {
      console.error('Character not found for update:', { characterId: id })
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 }
      )
    }

    console.error('Error updating character:', {
      characterId: id,
      updateFields: Object.keys(updateData),
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: 'Failed to update character' },
      { status: 500 }
    )
  }
}

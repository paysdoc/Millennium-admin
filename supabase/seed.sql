-- Create the character_images storage bucket (matches production)
INSERT INTO storage.buckets (id, name, public)
VALUES ('character_images', 'character_images', true)
ON CONFLICT (id) DO NOTHING;

import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/app/lib/firebase';

export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
const DOC_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
const AUDIO_MIME = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'] as const;

export type TelecomMediaType = 'image' | 'document' | 'audio';

export function detectMediaType(file: File): TelecomMediaType | null {
  if (IMAGE_MIME.includes(file.type as (typeof IMAGE_MIME)[number])) return 'image';
  if (DOC_MIME.includes(file.type as (typeof DOC_MIME)[number])) return 'document';
  if (AUDIO_MIME.includes(file.type as (typeof AUDIO_MIME)[number])) return 'audio';
  return null;
}

export async function uploadMedia(input: {
  file: File | Blob;
  uploaderUid: string;
  conversationId: string;
  mediaType: TelecomMediaType;
  fileName?: string;
  mimeType?: string;
}): Promise<{ url: string; name: string; mimeType: string; size: number }> {
  const size = input.file.size;
  if (size > MAX_MEDIA_BYTES) {
    throw new Error('MEDIA_TOO_LARGE');
  }
  const safeName = (input.fileName || `upload-${Date.now()}`).replace(/[^\w.\-]/g, '_');
  const mimeType = input.mimeType || ('type' in input.file ? input.file.type : 'application/octet-stream');
  const path = `telecom_media/${input.conversationId}/${input.uploaderUid}/${Date.now()}-${safeName}`;
  const objectRef = ref(storage, path);
  await uploadBytes(objectRef, input.file, { contentType: mimeType || undefined });
  const url = await getDownloadURL(objectRef);
  return { url, name: safeName, mimeType, size };
}

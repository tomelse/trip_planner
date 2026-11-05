import * as db from './db'
import { download } from './backup'
import type { Attachment } from './types'

export const isImage = (a: Pick<Attachment, 'mime'>) => db.INLINE_IMAGES.includes(a.mime)

/** Blob for an attachment, or undefined if it has gone missing. */
export const loadBlob = (id: number) => db.getBlob(id)

/** Save an attachment to the device. Always as an opaque download, so a file can never be rendered by the app. */
export async function saveAttachment(a: Pick<Attachment, 'id' | 'name'>) {
  const blob = await db.getBlob(a.id)
  if (blob) download(new Blob([blob], { type: 'application/octet-stream' }), a.name)
}

/** Longest side, in pixels, that a photo is kept at. Plenty for a ticket or a snapshot, a fraction of a camera original. */
export const MAX_PHOTO_SIDE = 2048
const SHRINKABLE = ['image/jpeg', 'image/png', 'image/webp']

/** `w` × `h` scaled down to fit `max` on the longest side. Never scaled up. */
export function fitWithin(w: number, h: number, max = MAX_PHOTO_SIDE) {
  const scale = Math.min(1, max / Math.max(w, h))
  return { width: Math.round(w * scale), height: Math.round(h * scale), scaled: scale < 1 }
}

/**
 * A phone camera photo is often 5-10 MB, which would fill the device's storage and make every backup huge. Photos
 * bigger than MAX_PHOTO_SIDE are scaled down and re-saved (which also drops hidden metadata such as the GPS position
 * the photo was taken at). Anything else, or anything that goes wrong, is stored exactly as it was.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!SHRINKABLE.includes(file.type) || typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { width, height, scaled } = fitWithin(bitmap.width, bitmap.height)
    if (!scaled) {
      bitmap.close()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.85))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name, { type: file.type, lastModified: file.lastModified })
  } catch {
    return file
  }
}

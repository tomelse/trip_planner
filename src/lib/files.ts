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

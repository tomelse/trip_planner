import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createReadStream, createWriteStream, existsSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import {
  attachmentFile, get, insert, insertAttachment, listTrips, purge, remove, restore, tripDetail, update, uploadDir,
  tables, type Table,
} from './db.ts'

const port = Number(process.env.PORT ?? 3001)
const MAX_UPLOAD = 50 * 1024 * 1024
// Only raster images are ever shown inline; everything else downloads, so an uploaded .html or .svg can't run on this origin.
const INLINE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'])
const CHILDREN = ['places', 'notes', 'legs', 'items'] as const

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const text = Buffer.concat(chunks).toString()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new HttpError(400, 'invalid JSON')
  }
}

function send(res: ServerResponse, status: number, data?: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(data === undefined ? '' : JSON.stringify(data))
}

const optionalId = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null)

async function upload(req: IncomingMessage, tripId: number, url: URL) {
  if (!tripDetail(tripId)) throw new HttpError(404, 'not found')
  const declared = Number(req.headers['content-length'] ?? 0)
  if (declared > MAX_UPLOAD) throw new HttpError(413, 'file too large (50 MB max)')

  const stored = randomUUID()
  const path = join(uploadDir, stored)
  let size = 0
  const limit = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length
      cb(size > MAX_UPLOAD ? new HttpError(413, 'file too large (50 MB max)') : null, chunk)
    },
  })
  try {
    await pipeline(req, limit, createWriteStream(path))
  } catch (e) {
    if (existsSync(path)) unlinkSync(path)
    throw e
  }
  const mime = String(req.headers['content-type'] ?? 'application/octet-stream').split(';')[0].trim().toLowerCase()
  const name = (url.searchParams.get('name') ?? 'file').replace(/[\r\n]/g, ' ').slice(0, 200) || 'file'
  return insertAttachment(tripId, {
    place_id: optionalId(url.searchParams.get('place_id')),
    leg_id: optionalId(url.searchParams.get('leg_id')),
    name,
    mime,
    size,
    stored,
  })
}

function serveFile(res: ServerResponse, id: number) {
  const f = attachmentFile(id)
  if (!f || !existsSync(join(uploadDir, f.stored))) return send(res, 404, { error: 'not found' })
  const inline = INLINE.has(f.mime)
  res.writeHead(200, {
    'content-type': inline ? f.mime : 'application/octet-stream',
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    'x-content-type-options': 'nosniff',
    'content-security-policy': 'sandbox',
    'cache-control': 'private, max-age=3600',
  })
  createReadStream(join(uploadDir, f.stored)).pipe(res)
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean) // ['api', 'trips', '1', 'places']
    const method = req.method ?? 'GET'
    const [, resource, rawId, sub] = parts
    const id = Number(rawId)

    if (parts[0] !== 'api') return send(res, 404, { error: 'not found' })

    if (resource === 'trips') {
      if (!rawId) {
        if (method === 'GET') return send(res, 200, listTrips())
        if (method === 'POST') return send(res, 201, insert('trips', await body(req)))
      } else if (!sub) {
        if (method === 'GET') {
          const detail = tripDetail(id)
          return detail ? send(res, 200, detail) : send(res, 404, { error: 'not found' })
        }
        if (method === 'PATCH') return send(res, 200, update('trips', id, await body(req)))
        if (method === 'DELETE') return remove('trips', id), send(res, 204)
      } else if (method === 'POST' && sub === 'attachments') {
        return send(res, 201, await upload(req, id, url))
      } else if (method === 'POST' && (CHILDREN as readonly string[]).includes(sub)) {
        return send(res, 201, insert(sub as Table, await body(req), id))
      }
    } else if (resource === 'restore' && method === 'POST') {
      const table = rawId as Table
      const target = Number(sub)
      if (!tables.includes(table) || !get(table, target)) return send(res, 404, { error: 'not found' })
      return send(res, 200, restore(table, target))
    } else if (resource === 'files' && method === 'GET') {
      return serveFile(res, id)
    } else if (tables.includes(resource as Table) && resource !== 'trips') {
      if (!get(resource as Table, id)) return send(res, 404, { error: 'not found' })
      if (method === 'PATCH') return send(res, 200, update(resource as Table, id, await body(req)))
      if (method === 'DELETE') return remove(resource as Table, id), send(res, 204)
    }
    send(res, 404, { error: 'not found' })
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message })
    console.error(e)
    send(res, 500, { error: String(e) })
  }
})

purge()
server.listen(port, () => console.log(`api on http://localhost:${port}`))

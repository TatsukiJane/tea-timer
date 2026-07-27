/**
 * Minimal static file server for e2e/update.mjs.
 *
 * `vite preview` would do, but it is pinned to dist/ — and the update run needs to
 * swap the served directory between two versions. Everything is sent with
 * `no-store` so a swap is picked up immediately rather than out of the HTTP cache.
 *
 *   node e2e/static-server.mjs <root> <port>
 */

import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, normalize, extname } from 'node:path'

const [root = 'dist', port = '4199'] = process.argv.slice(2)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  // normalize() collapses ".." so a request cannot climb out of the root.
  let path = join(root, normalize(decodeURIComponent(url.pathname)))

  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html')
  } catch {
    response.writeHead(404).end('not found')
    return
  }

  try {
    const body = await readFile(path)
    response.writeHead(200, {
      'content-type': TYPES[extname(path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    })
    response.end(body)
  } catch {
    response.writeHead(404).end('not found')
  }
}).listen(Number(port))

// Writes build/icon.png: a plain placeholder icon made with code (a letter F built from rectangles on a solid square).
// It is only a stand-in. To use your own icon, replace build/icon.png with a square PNG of at least 256 x 256 pixels.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SIZE = 512
const BG = [43, 54, 99]
const FG = [232, 233, 237]

function crc32(buf) {
  let crc = 0xffffffff
  for (const b of buf) {
    crc ^= b
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

// the letter F: a vertical bar, a top bar and a middle bar (x, y, width, height)
const RECTS = [
  [150, 100, 70, 312],
  [150, 100, 230, 70],
  [150, 224, 170, 64]
]
const inside = (x, y) => RECTS.some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh)

const raw = Buffer.alloc(SIZE * (1 + SIZE * 4))
for (let y = 0; y < SIZE; y++) {
  const row = y * (1 + SIZE * 4)
  raw[row] = 0
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b] = inside(x, y) ? FG : BG
    const o = row + 1 + x * 4
    raw[o] = r
    raw[o + 1] = g
    raw[o + 2] = b
    raw[o + 3] = 255
  }
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8
ihdr[9] = 6
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
])
const out = join(root, 'build', 'icon.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log(`Wrote ${out} (${png.length} bytes)`)

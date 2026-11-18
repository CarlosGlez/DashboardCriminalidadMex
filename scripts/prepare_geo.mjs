// Genera las geometrías del mapa (TopoJSON ligero) a partir del servicio web
// de INEGI (Marco Geoestadístico, wscatgeo).
//
// Uso (desde la raíz del proyecto):
//   node scripts/prepare_geo.mjs [carpeta_trabajo] [carpeta_salida]
//
//   carpeta_trabajo  donde se guardan los GeoJSON originales (default: geo_raw/,
//                    ignorada por git). Si ya existen, no se vuelven a bajar.
//   carpeta_salida   default: dashboard/public/geo/
//
// Salida (es lo ÚNICO que se versiona):
//   estados.topo.json        32 estados          (objeto "ent": name = nombre INEGI, e = cve_ent)
//   mun/<cve_ent>.topo.json  municipios del estado (objeto "mun": c = cve_mun, entero)
//
// Requiere Node 18+ y red. Usa mapshaper vía npx (versión fija, no se instala en el proyecto).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const BASE = 'https://gaia.inegi.org.mx/wscatgeo/v2/geo'
const MAPSHAPER = 'mapshaper@0.6.109'
const SIMPLIFY_MUN = '3%'     // municipios: Oaxaca (570) queda en ~130 KB
const SIMPLIFY_ENT = '1%'     // estados (vista nacional)
const QUANTIZATION = 10000

const work = resolve(process.argv[2] ?? 'geo_raw')
const out = resolve(process.argv[3] ?? 'dashboard/public/geo')
mkdirSync(work, { recursive: true })
mkdirSync(join(out, 'mun'), { recursive: true })

async function download(url, dest) {
  if (existsSync(dest) && statSync(dest).size > 1000) return
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
      return
    } catch (e) {
      if (intento === 3) throw new Error(`No pude bajar ${url}: ${e.message}`)
    }
  }
}

function mapshaper(args) {
  const r = spawnSync('npx', ['--yes', MAPSHAPER, ...args], { shell: true, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`mapshaper falló:\n${r.stdout}\n${r.stderr}`)
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`
function reportar(nombre, ruta) {
  const buf = readFileSync(ruta)
  console.log(`${nombre.padEnd(16)} ${kb(buf.length).padStart(10)}  (gzip ${kb(gzipSync(buf, { level: 9 }).length)})`)
}

// Estados
const entSrc = join(work, 'mgee_all.json')
await download(`${BASE}/mgee`, entSrc)
const entOut = join(out, 'estados.topo.json')
mapshaper([
  '-i', entSrc,
  '-each', 'name=nomgeo,e=+cve_ent',   // sin espacios: spawn con shell los partiría en 2 argumentos
  '-filter-fields', 'name,e',
  '-simplify', SIMPLIFY_ENT, 'keep-shapes',
  '-clean',
  '-rename-layers', 'ent',
  '-o', entOut, 'format=topojson', `quantization=${QUANTIZATION}`,
])
reportar('estados', entOut)

// Municipios, un archivo por estado
let total = 0
for (let i = 1; i <= 32; i++) {
  const ent = String(i).padStart(2, '0')
  const src = join(work, `mgem_${ent}.json`)
  await download(`${BASE}/mgem/${ent}`, src)
  const dest = join(out, 'mun', `${ent}.topo.json`)
  mapshaper([
    '-i', src,
    '-each', 'c=+cvegeo',
    '-filter-fields', 'c',
    '-simplify', SIMPLIFY_MUN, 'keep-shapes',
    '-clean',
    '-rename-layers', 'mun',
    '-o', dest, 'format=topojson', `quantization=${QUANTIZATION}`,
  ])
  const n = JSON.parse(readFileSync(dest, 'utf8')).objects.mun.geometries.length
  total += n
  reportar(`mun/${ent} (${n})`, dest)
}
console.log(`\nTotal municipios: ${total}`)

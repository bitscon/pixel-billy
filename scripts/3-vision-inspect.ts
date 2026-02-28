/**
 * Stage 3: Metadata Draft Generation
 *
 * Produces deterministic metadata defaults for each detected asset.
 * No external model/API calls are used.
 *
 * Usage:
 *   npx tsx scripts/3-vision-inspect.ts
 *
 * Requires:
 *   - scripts/.tileset-working/asset-editor-output.json
 */

import { readFileSync, writeFileSync } from 'fs'

interface AssetInput {
  id: string
  paddedX: number
  paddedY: number
  paddedWidth: number
  paddedHeight: number
  erasedPixels?: Array<{ x: number; y: number }>
}

const inputJsonPath = './scripts/.tileset-working/asset-editor-output.json'
const outputJsonPath = './scripts/.tileset-working/tileset-metadata-draft.json'

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  desks: ['desk', 'table', 'workbench', 'counter'],
  chairs: ['chair', 'stool', 'seat', 'bench'],
  storage: ['cabinet', 'shelf', 'drawer', 'locker', 'crate', 'box'],
  decor: ['plant', 'poster', 'art', 'painting', 'picture', 'statue', 'vase', 'clock'],
  electronics: ['computer', 'monitor', 'laptop', 'screen', 'tv', 'terminal', 'console', 'server'],
}

const WALL_KEYWORDS = ['wall', 'shelf', 'poster', 'picture', 'painting', 'art', 'clock', 'sign']

function sanitizeName(id: string): string {
  return id
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase() || 'ASSET'
}

function toLabel(id: string): string {
  const words = id
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

  if (words.length === 0) {
    return 'Asset'
  }

  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function inferCategory(id: string): string {
  const needle = id.toLowerCase()

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => needle.includes(keyword))) {
      return category
    }
  }

  return 'misc'
}

function inferCanPlaceOnWalls(id: string): boolean {
  const needle = id.toLowerCase()
  return WALL_KEYWORDS.some((keyword) => needle.includes(keyword))
}

function inferIsDesk(id: string, category: string): boolean {
  if (category === 'desks') {
    return true
  }
  const needle = id.toLowerCase()
  return needle.includes('desk') || needle.includes('table')
}

function main() {
  console.log('\n🧩 Stage 3: Metadata Draft Generation\n')
  console.log(`📖 Loading ${inputJsonPath}...`)

  const inputData = JSON.parse(readFileSync(inputJsonPath, 'utf-8'))
  const assets: AssetInput[] = inputData.assets || []

  console.log(`   Found ${assets.length} assets\n`)

  const output = {
    version: 1,
    timestamp: new Date().toISOString(),
    sourceFile: inputData.sourceFile,
    tileset: inputData.tileset,
    backgroundColor: inputData.backgroundColor,
    assets: assets.map((asset) => {
      const category = inferCategory(asset.id)
      return {
        id: asset.id,
        paddedX: asset.paddedX,
        paddedY: asset.paddedY,
        paddedWidth: asset.paddedWidth,
        paddedHeight: asset.paddedHeight,
        erasedPixels: asset.erasedPixels,
        name: sanitizeName(asset.id),
        label: toLabel(asset.id),
        category,
        footprintW: Math.max(1, Math.round(asset.paddedWidth / 16)),
        footprintH: Math.max(1, Math.round(asset.paddedHeight / 16)),
        isDesk: inferIsDesk(asset.id, category),
        canPlaceOnWalls: inferCanPlaceOnWalls(asset.id),
        discard: false,
      }
    }),
  }

  writeFileSync(outputJsonPath, JSON.stringify(output, null, 2))

  console.log(`✅ Metadata draft saved to: ${outputJsonPath}`)
  console.log(`📊 Total assets: ${assets.length}`)
  console.log('\n📋 Next step: Review metadata in Stage 4')
  console.log('   open scripts/4-review-metadata.html\n')
}

main()

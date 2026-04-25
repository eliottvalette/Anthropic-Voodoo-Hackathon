export type RequiredAsset = {
  asset_id?: string
  name?: string
  category?: string
  visual_description?: string
  priority?: number | string
}

export type ImportedAssetFile = {
  name: string
  relativePath?: string
  size?: number
}

export type AssetCoverageState = 'provided' | 'missing'

export type AssetCoverageItem = {
  asset: RequiredAsset
  coverage: AssetCoverageState
  importedFile?: ImportedAssetFile
  score: number
  matchReason?: string
}

export type AssetCoverageSummary = {
  total: number
  provided: number
  missing: number
  byCategory: Record<string, { total: number; provided: number; missing: number }>
}

const GENERIC_TOKENS = new Set([
  'asset',
  'assets',
  'image',
  'img',
  'png',
  'jpg',
  'jpeg',
  'webp',
  '2x',
  '3x',
])

function stripExtension(value: string): string {
  return value.replace(/\.[a-z0-9]+$/i, '')
}

export function normalizeAssetText(value: string | undefined | null): string {
  return stripExtension(String(value ?? ''))
    .replace(/@([23])x/gi, ' $1x ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokensFor(value: string | undefined | null): string[] {
  return normalizeAssetText(value)
    .split(' ')
    .filter(token => token && !GENERIC_TOKENS.has(token))
}

function unique(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map(value => normalizeAssetText(value)).filter(Boolean))]
}

function fileCandidates(file: ImportedAssetFile): string[] {
  const relativePath = file.relativePath ?? file.name
  const pathSegments = relativePath.split(/[\\/]/g)
  return unique([
    file.name,
    stripExtension(file.name),
    relativePath,
    ...pathSegments,
    ...pathSegments.map(stripExtension),
  ])
}

function assetCandidates(asset: RequiredAsset): string[] {
  return unique([asset.asset_id, asset.name])
}

function tokenScore(assetText: string, fileText: string): number {
  const assetTokens = tokensFor(assetText)
  if (assetTokens.length === 0) return 0
  const fileTokens = new Set(tokensFor(fileText))
  const matches = assetTokens.filter(token => fileTokens.has(token)).length
  return matches / assetTokens.length
}

function scoreFile(asset: RequiredAsset, file: ImportedAssetFile): { score: number; reason?: string } {
  const assets = assetCandidates(asset)
  const files = fileCandidates(file)

  for (const assetText of assets) {
    if (files.includes(assetText)) {
      return { score: 1, reason: 'exact name' }
    }
  }

  let best = { score: 0, reason: undefined as string | undefined }
  for (const assetText of assets) {
    for (const fileText of files) {
      if (assetText.length > 3 && fileText.includes(assetText)) {
        best = best.score < 0.95 ? { score: 0.95, reason: 'file contains asset id' } : best
      } else if (fileText.length > 3 && assetText.includes(fileText)) {
        best = best.score < 0.9 ? { score: 0.9, reason: 'asset id contains file name' } : best
      }

      const overlap = tokenScore(assetText, fileText)
      if (overlap >= 0.6 && overlap > best.score) {
        best = { score: overlap, reason: 'token overlap' }
      }
    }
  }

  return best
}

function compareAssetToImports(asset: RequiredAsset, importedFiles: ImportedAssetFile[]): AssetCoverageItem {
  const best = importedFiles.reduce(
    (current, file) => {
      const scored = scoreFile(asset, file)
      return scored.score > current.score
        ? { file, score: scored.score, reason: scored.reason }
        : current
    },
    { file: undefined as ImportedAssetFile | undefined, score: 0, reason: undefined as string | undefined },
  )

  if (best.file && best.score >= 0.6) {
    return {
      asset,
      coverage: 'provided',
      importedFile: best.file,
      score: best.score,
      matchReason: best.reason,
    }
  }

  return { asset, coverage: 'missing', score: 0 }
}

export function compareRequiredAssetsToImports(
  requiredAssets: RequiredAsset[],
  importedFiles: ImportedAssetFile[],
): AssetCoverageItem[] {
  return requiredAssets.map(asset => compareAssetToImports(asset, importedFiles))
}

export function summarizeAssetCoverage(coverage: AssetCoverageItem[]): AssetCoverageSummary {
  return coverage.reduce<AssetCoverageSummary>(
    (summary, item) => {
      const category = item.asset.category || 'uncategorized'
      const previous = summary.byCategory[category] ?? { total: 0, provided: 0, missing: 0 }
      const categoryCounts = {
        total: previous.total + 1,
        provided: previous.provided + (item.coverage === 'provided' ? 1 : 0),
        missing: previous.missing + (item.coverage === 'missing' ? 1 : 0),
      }

      return {
        total: summary.total + 1,
        provided: summary.provided + (item.coverage === 'provided' ? 1 : 0),
        missing: summary.missing + (item.coverage === 'missing' ? 1 : 0),
        byCategory: {
          ...summary.byCategory,
          [category]: categoryCounts,
        },
      }
    },
    { total: 0, provided: 0, missing: 0, byCategory: {} },
  )
}

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  compareRequiredAssetsToImports,
  summarizeAssetCoverage,
  type ImportedAssetFile,
  type RequiredAsset,
} from './assetCoverage.ts'

test('matches Gemini-required assets against imported files by id and readable name', () => {
  const requiredAssets: RequiredAsset[] = [
    { asset_id: 'blue_castle_exterior', name: 'Player Castle Exterior', category: 'castle' },
    { asset_id: 'proj_missile', name: 'Rocket Projectile', category: 'projectile' },
    { asset_id: 'ui_health_bars', name: 'Health Bars', category: 'ui' },
  ]
  const importedFiles: ImportedAssetFile[] = [
    { name: 'blue_castle_exterior.png', relativePath: 'props/blue_castle_exterior.png' },
    { name: 'health-bars@2x.png', relativePath: 'ui/health-bars@2x.png' },
  ]

  const coverage = compareRequiredAssetsToImports(requiredAssets, importedFiles)

  assert.deepEqual(
    coverage.map(item => ({
      asset_id: item.asset.asset_id,
      coverage: item.coverage,
      match: item.importedFile?.name ?? null,
    })),
    [
      { asset_id: 'blue_castle_exterior', coverage: 'provided', match: 'blue_castle_exterior.png' },
      { asset_id: 'proj_missile', coverage: 'missing', match: null },
      { asset_id: 'ui_health_bars', coverage: 'provided', match: 'health-bars@2x.png' },
    ],
  )
})

test('summarizes missing coverage for pipeline gating', () => {
  const coverage = compareRequiredAssetsToImports(
    [
      { asset_id: 'castle_player', category: 'castle' },
      { asset_id: 'castle_enemy', category: 'castle' },
      { asset_id: 'vfx_explosion', category: 'vfx' },
    ],
    [{ name: 'castle-player.png', relativePath: 'castle-player.png' }],
  )

  assert.deepEqual(summarizeAssetCoverage(coverage), {
    total: 3,
    provided: 1,
    missing: 2,
    byCategory: {
      castle: { total: 2, provided: 1, missing: 1 },
      vfx: { total: 1, provided: 0, missing: 1 },
    },
  })
})

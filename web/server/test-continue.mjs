/**
 * Validates executeContinue + charge formulas (2024 → last completed half-hour).
 */
import fs from 'fs'
import path from 'path'
import { executeContinue, EXPORT_FILENAME, IMPORT_FILENAME } from './continueCore.mjs'
import { resolveProjectPaths } from './projectPaths.mjs'

const PROJECT_ID = 'ci-bess-uk'
const paths = resolveProjectPaths(PROJECT_ID)
const DATA_DIR = paths.dataDir

const row = Array(48).fill('green')
const body = {
  importNonEnergy: '5',
  duos: {
    green: { import: '10', export: '-3' },
    amber: { import: '20', export: '-30' },
    red: { import: '100', export: '-200' },
  },
  bandMatrix: [row, row],
}

const result = executeContinue(PROJECT_ID, body)
if (!result.ok) {
  console.error('executeContinue failed:', result)
  process.exit(1)
}

if (result.files.rowCount < 1000) {
  console.error('FAIL: expected a long series from 2024 to now, got', result.files.rowCount)
  process.exit(1)
}

const importPath = path.join(DATA_DIR, IMPORT_FILENAME)
const exportPath = path.join(DATA_DIR, EXPORT_FILENAME)
const importLines = fs.readFileSync(importPath, 'utf8').trim().split('\n')
const exportLines = fs.readFileSync(exportPath, 'utf8').trim().split('\n')

const firstImport = importLines[1].split(',')
const firstExport = exportLines[1].split(',')
const importVal = firstImport[firstImport.length - 1]
const exportVal = firstExport[firstExport.length - 1]

console.log(
  'First row import charge (£/MWh):',
  importVal,
  '(expect 15 = 10 DUoS + 5 non-energy)',
)
console.log(
  'First row export charge (£/MWh):',
  exportVal,
  '(expect -3 = export DUoS green)',
)
console.log('Total rows:', result.files.rowCount)

if (importVal !== '15') {
  console.error('FAIL: import charge expected 15')
  process.exit(1)
}
if (exportVal !== '-3') {
  console.error('FAIL: export charge expected -3')
  process.exit(1)
}

console.log('OK — rows written to', DATA_DIR)

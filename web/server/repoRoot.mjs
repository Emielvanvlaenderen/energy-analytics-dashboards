import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Repository root (`web/`, `projects/`, `scripts/`). */
export const REPO_ROOT = path.join(__dirname, '..', '..')

export const PROJECTS_DIR = path.join(REPO_ROOT, 'projects')

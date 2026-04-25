// Tiny IndexedDB-backed run history.  Stores RunMeta + the generated HTML
// blob keyed by runId. Used by HistoryView and to resume from refresh.

const DB_NAME = 'voodoo_track'
const DB_VERSION = 1
const STORE = 'runs'

export type StoredRun = {
  runId: string
  createdAt: string
  gameName: string
  genre: string
  mechanic: string
  templateId?: string | null
  htmlBytes: number
  verifyRuns: boolean
  retries: number
  totalLatencyMs: number
  totalTokensIn: number
  totalTokensOut: number
  // Heavyweight payloads stored alongside
  html: string
  meta: unknown
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'runId' })
        os.createIndex('createdAt', 'createdAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveRun(run: StoredRun): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(run)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function listRuns(): Promise<StoredRun[]> {
  const db = await openDb()
  const runs: StoredRun[] = []
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).openCursor(null, 'prev')
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        runs.push(cursor.value as StoredRun)
        cursor.continue()
      } else {
        resolve()
      }
    }
    req.onerror = () => reject(req.error)
  })
  db.close()
  // newest first
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getRun(runId: string): Promise<StoredRun | null> {
  const db = await openDb()
  const run = await new Promise<StoredRun | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(runId)
    req.onsuccess = () => resolve((req.result as StoredRun) ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return run
}

export async function deleteRun(runId: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(runId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

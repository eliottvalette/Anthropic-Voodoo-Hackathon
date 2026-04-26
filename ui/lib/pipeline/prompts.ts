// Tiny client-side prompt loader. Prompts live as static markdown under
// ui/public/prompts/<variant>/*.md (symlinked from proto-pipeline-m/prompts/).

const cache = new Map<string, string>()

export async function loadPrompt(variant: string, name: string): Promise<string> {
  const key = `${variant}/${name}`
  const hit = cache.get(key)
  if (hit) return hit
  const url = `/prompts/${variant}/${name}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`prompt not found: ${url}`)
  const text = await res.text()
  cache.set(key, text)
  return text
}

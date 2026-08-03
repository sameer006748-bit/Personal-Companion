import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !specifier.match(/\.[a-z0-9]+$/iu)) {
    const parentPath = fileURLToPath(context.parentURL)
    const candidate = new URL(`${specifier}.ts`, pathToFileURL(parentPath))
    if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}

// Vite exposes build-time configuration on import.meta.env, which Node does not
// define, so reading it under the test runner throws before a module body runs.
// Rewriting it to an empty object lets application modules be imported and
// exercised directly; every value it carries is public build configuration, and
// an absent value is exactly the "not configured" path the code already handles.
export async function load(url, context, nextLoad) {
  const loaded = await nextLoad(url, context)
  if (typeof loaded.source !== 'string' && !(loaded.source instanceof Uint8Array)) return loaded
  const source = loaded.source.toString()
  if (!source.includes('import.meta.env')) return loaded
  return { ...loaded, source: source.replaceAll('import.meta.env', '({})') }
}

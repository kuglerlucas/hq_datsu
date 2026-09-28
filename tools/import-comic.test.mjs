import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

const importerPath = resolve(dirname(fileURLToPath(import.meta.url)), 'import-comic.mjs')

function createBundle(pdfPath = 'content/comics/first-signal/first-signal.pdf') {
  const manifest = {
    id: 'first-signal',
    title: 'Primeiro sinal',
    subtitle: '',
    description: '',
    author: 'Datsu',
    pageCount: 2,
    pdf: pdfPath,
    tracks: [],
    cues: [],
  }

  return zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'public/content/comics/first-signal/first-signal.pdf': new Uint8Array([37, 80, 68, 70]),
  })
}

async function createProject() {
  const directory = await mkdtemp(join(tmpdir(), 'datsu-import-test-'))
  const contentDirectory = join(directory, 'public', 'content')
  await mkdir(contentDirectory, { recursive: true })
  await writeFile(join(contentDirectory, 'catalog.json'), '{"comics":[]}\n', 'utf8')
  return directory
}

describe('comic ZIP importer', () => {
  it('installs the PDF and adds its manifest to the catalog', async () => {
    const project = await createProject()
    const bundlePath = join(project, 'publication.zip')

    try {
      await writeFile(bundlePath, createBundle())
      const output = execFileSync(process.execPath, [importerPath, bundlePath], {
        cwd: project,
        encoding: 'utf8',
      })
      const catalog = JSON.parse(await readFile(join(project, 'public/content/catalog.json'), 'utf8'))
      const pdf = await readFile(join(project, 'public/content/comics/first-signal/first-signal.pdf'))

      expect(output).toContain('HQ "Primeiro sinal" importada')
      expect(catalog.comics).toHaveLength(1)
      expect(catalog.comics[0].id).toBe('first-signal')
      expect([...pdf]).toEqual([37, 80, 68, 70])
    } finally {
      await rm(project, { recursive: true, force: true })
    }
  })

  it('rejects duplicate IDs without --replace and blocks path traversal', async () => {
    const project = await createProject()
    const bundlePath = join(project, 'publication.zip')

    try {
      await writeFile(bundlePath, createBundle())
      execFileSync(process.execPath, [importerPath, bundlePath], { cwd: project })
      expect(() => execFileSync(process.execPath, [importerPath, bundlePath], { cwd: project })).toThrow()

      const unsafeBundle = join(project, 'unsafe.zip')
      await writeFile(unsafeBundle, createBundle('content/comics/first-signal/../../escape.pdf'))
      expect(() => execFileSync(process.execPath, [importerPath, unsafeBundle], { cwd: project })).toThrow()
      await readFile(join(project, 'public/content/catalog.json'), 'utf8')
    } finally {
      await rm(project, { recursive: true, force: true })
    }
  })
})
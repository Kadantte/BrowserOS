import { writeFile } from 'node:fs/promises'
import { generateCatalog } from './catalog-utils'

const catalog = await generateCatalog()
const json = JSON.stringify(catalog, null, 2)

const outputIdx = process.argv.indexOf('-o')
if (outputIdx !== -1 && process.argv[outputIdx + 1]) {
  const outPath = process.argv[outputIdx + 1]
  await writeFile(outPath, json)
  console.log(`Wrote catalog with ${catalog.skills.length} skills to ${outPath}`)
} else {
  console.log(json)
}

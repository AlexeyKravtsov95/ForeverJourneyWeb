// Vitest globalSetup: fixtures/ is gitignored (they are generated artifacts),
// so every test run regenerates the SavedVariables fixtures first — otherwise
// a clean checkout would fail the suite that reads them from disk.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export default function generateSavedVariablesFixtures() {
  const generator = fileURLToPath(new URL('./generate-savedvariables-fixture.mjs', import.meta.url))
  execFileSync(process.execPath, [generator], { stdio: 'inherit' })
}

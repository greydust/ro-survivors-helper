import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// Local preflight stays offline. GitHub Actions publishes the validated bundle
// to the greasyfork branch; Greasy Fork's native webhook handles the account.
if (!process.argv.includes('--dry-run') || process.argv.includes('--publish'))
  throw new Error('Use --dry-run locally. Publication runs through GitHub Actions and native Greasy Fork sync; see doc/WORKFLOWS.md.');
const file = fileURLToPath(new URL('../dist/RO倖存者助手.user.js',import.meta.url));
const source = await readFile(file,'utf8');
const descriptionFile = fileURLToPath(new URL('../doc/GREASYFORK.md',import.meta.url));
const description = await readFile(descriptionFile,'utf8');
if (!description.trim()) throw new Error('Greasy Fork description is empty');
const metadata = Object.fromEntries(['name','version','license','namespace','match'].map(key =>
  [key, source.match(new RegExp(`^// @${key}\\s+(.+)$`,'m'))?.[1]?.trim()]));
if (Object.values(metadata).some(value => !value)) throw new Error('Incomplete userscript metadata');
console.log(JSON.stringify({ mode:'dry-run', uploaded:false, file, metadata,
  sha256:createHash('sha256').update(source).digest('hex'),
  scriptId:605561,
  syncUrl:'https://raw.githubusercontent.com/greydust/ro-survivors-helper/greasyfork/ro-survivors-helper.user.js',
  descriptionFile,
  descriptionSyncUrl:'https://raw.githubusercontent.com/greydust/ro-survivors-helper/greasyfork/greasyfork-description.md',
  next:'Manually run Publish Greasy Fork source on main in GitHub Actions. One-time Greasy Fork sync and GitHub webhook setup is required; see doc/WORKFLOWS.md.'
},null,2));

import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => entry.isDirectory()
    ? filesIn(path.join(directory, entry.name))
    : entry.isFile() && entry.name.endsWith('.js') ? [path.join(directory, entry.name)] : []));
  return groups.flat();
}
const files = (await filesIn(path.join(root, 'src'))).sort((a,b) =>
  path.relative(root,a).replaceAll('\\','/').localeCompare(path.relative(root,b).replaceAll('\\','/'), 'en'));
if (!files.length) throw new Error('src/ contains no JavaScript sources');
// Sources are ordered fragments sharing one IIFE. Preserve their exact text;
// do not add wrappers or separators that could change userscript metadata.
const source = (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('');
if ((source.match(/\/\/ ==UserScript==/g)||[]).length !== 1 || !source.startsWith('// ==UserScript=='))
  throw new Error('Expected one userscript header at the start of the bundle');
for (const key of ['name','namespace','version','match','license'])
  if (!new RegExp(`^// @${key}\\s+\\S`, 'm').test(source)) throw new Error(`Missing @${key}`);
const pkg = JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const version = source.match(/^\/\/ @version\s+(\S+)/m)?.[1];
if (version !== pkg.version) throw new Error('package.json version differs from userscript @version');
new vm.Script(source, { filename:'RO倖存者助手.user.js' }); // Compile only, never execute the game/helper.
await mkdir(path.join(root,'dist'), {recursive:true});
const output = path.join(root,'dist','RO倖存者助手.user.js');
await writeFile(output, source, 'utf8');
console.log(`Built ${path.relative(root,output)} from ${files.length} files`);
console.log(`SHA256 ${createHash('sha256').update(source).digest('hex')}`);

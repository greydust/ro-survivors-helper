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
const sourceRoot = path.join(root, 'src');
const order = JSON.parse(await readFile(new URL('./build-order.json', import.meta.url), 'utf8'));
if (!Array.isArray(order) || !order.length || order.some(file => typeof file !== 'string'))
  throw new Error('scripts/build-order.json must be a non-empty array of source paths');
if (new Set(order).size !== order.length) throw new Error('Duplicate source paths in scripts/build-order.json');
const available = new Map((await filesIn(sourceRoot)).map(file =>
  [path.relative(sourceRoot, file).replaceAll('\\', '/'), file]));
const unknown = order.filter(file => !available.has(file));
const omitted = [...available.keys()].filter(file => !order.includes(file));
if (unknown.length || omitted.length)
  throw new Error(`Source list mismatch: unknown=[${unknown.join(', ')}], omitted=[${omitted.join(', ')}]`);
const files = order.map(file => available.get(file));
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

// Plain JavaScript for DevTools Console/Snippets, sharing the exact runtime.
const consoleSource='// RO 倖存者助手 '+version+' — 在遊戲頁面 Console 貼上執行；重新整理後需重貼。\n'
  +source.slice(source.indexOf('// ==/UserScript==')+'// ==/UserScript=='.length).trimStart();
new vm.Script(consoleSource,{filename:'RO倖存者助手.console.js'});
const consoleOutput=path.join(root,'dist','RO倖存者助手.console.js');
await writeFile(consoleOutput,consoleSource,'utf8');
console.log(`Built ${path.relative(root,consoleOutput)} for DevTools Console`);

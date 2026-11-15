import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(tmpdir(), 'ro-publish-test-'));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
try {
  const remote = path.join(temporary, 'remote.git');
  const local = path.join(temporary, 'local');
  await mkdir(remote);
  await mkdir(local);
  git(remote, 'init', '--bare');
  git(local, 'init', '--initial-branch=main');
  git(local, 'config', 'user.name', 'Publication Test');
  git(local, 'config', 'user.email', 'test@example.invalid');
  git(local, 'remote', 'add', 'origin', remote);
  for (const file of ['scripts/push-greasyfork.mjs', 'scripts/publish-greasyfork.mjs', 'dist/RO倖存者助手.user.js', 'doc/GREASYFORK.md']) {
    await mkdir(path.dirname(path.join(local, file)), { recursive: true });
    await copyFile(path.join(root, file), path.join(local, file));
  }
  git(local, 'add', '.');
  git(local, 'commit', '-m', 'Fixture');
  git(local, 'push', 'origin', 'main');
  await writeFile(path.join(local, 'untracked.txt'), 'Keep working files');
  const status = git(local, 'status', '--porcelain');
  const main = git(remote, 'rev-parse', 'main');
  const publish = () => execFileSync(process.execPath, ['scripts/push-greasyfork.mjs'], { cwd: local, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  publish();
  const first = git(remote, 'rev-parse', 'greasyfork');
  assert.equal(git(local, 'status', '--porcelain'), status);
  assert.deepEqual(git(remote, 'ls-tree', '--name-only', 'greasyfork').split('\n'), ['greasyfork-description.md', 'ro-survivors-helper.user.js']);
  publish();
  assert.equal(git(remote, 'rev-parse', 'greasyfork'), first, 'unchanged files must not produce a commit');
  await writeFile(path.join(local, 'doc/GREASYFORK.md'), 'Updated description\n');
  const changedStatus = git(local, 'status', '--porcelain');
  publish();
  assert.equal(git(remote, 'rev-parse', 'greasyfork^'), first, 'update must preserve remote history');
  assert.equal(git(remote, 'show', 'greasyfork:greasyfork-description.md'), 'Updated description');
  assert.equal(git(remote, 'rev-parse', 'main'), main, 'main must remain unchanged');
  assert.equal(git(local, 'branch', '--show-current'), 'main');
  assert.equal(git(local, 'status', '--porcelain'), changedStatus);
  console.log('PASS first publication, unchanged rerun, description update, main and working files preserved');
} finally {
  if (path.dirname(temporary) !== path.resolve(tmpdir()) || !path.basename(temporary).startsWith('ro-publish-test-'))
    throw new Error('Unexpected temporary directory; refusing cleanup.');
  await rm(temporary, { recursive: true, force: true });
}

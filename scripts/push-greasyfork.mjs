import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
// Read the exact bytes that passed the build/tests and preflight before any push.
execFileSync(process.execPath, ['scripts/publish-greasyfork.mjs', '--dry-run'], { cwd: root, stdio: 'inherit' });
const code = await readFile(path.join(root, 'dist/RO倖存者助手.user.js'));
const description = await readFile(path.join(root, 'doc/GREASYFORK.md'));
const remote = git(['remote', 'get-url', '--push', 'origin']);
const name = git(['config', 'user.name']);
const email = git(['config', 'user.email']);
if (!name || !email) throw new Error('Configure Git user.name and user.email before publishing.');
const sourceCommit = git(['rev-parse', '--short', 'HEAD']);
// An isolated repository preserves the active branch, index and working files.
const temporary = await mkdtemp(path.join(tmpdir(), 'ro-greasyfork-'));
try {
  git(['init', '--initial-branch=greasyfork'], temporary);
  git(['config', 'user.name', name], temporary);
  git(['config', 'user.email', email], temporary);
  git(['remote', 'add', 'origin', remote], temporary);
  const exists = git(['ls-remote', '--heads', 'origin', 'refs/heads/greasyfork'], temporary);
  if (exists) {
    git(['fetch', '--depth=1', 'origin', 'refs/heads/greasyfork'], temporary);
    git(['checkout', '-B', 'greasyfork', 'FETCH_HEAD'], temporary);
  }
  await writeFile(path.join(temporary, 'ro-survivors-helper.user.js'), code);
  await writeFile(path.join(temporary, 'greasyfork-description.md'), description);
  git(['add', '--', 'ro-survivors-helper.user.js', 'greasyfork-description.md'], temporary);
  if (!git(['diff', '--cached', '--name-only'], temporary)) {
    console.log('Code and description unchanged; no publication needed.');
  } else {
    git(['commit', '-m', `Publish userscript from ${sourceCommit} (local build)`], temporary);
    // Normal push rejects a concurrent update; never overwrite remote history.
    execFileSync('git', ['push', 'origin', 'HEAD:refs/heads/greasyfork'], { cwd: temporary, stdio: 'inherit' });
    console.log('Published sync source. Check Greasy Fork webhook delivery and script version.');
  }
} finally {
  if (path.dirname(temporary) !== path.resolve(tmpdir()) || !path.basename(temporary).startsWith('ro-greasyfork-'))
    throw new Error('Unexpected temporary directory; refusing cleanup.');
  await rm(temporary, { recursive: true, force: true });
}

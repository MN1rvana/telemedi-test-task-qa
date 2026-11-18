// Self-test for guard-paths.mjs: node --test .claude/hooks/guard-paths.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HOOK = fileURLToPath(new URL('./guard-paths.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url)); // ends with '/'

const exitCode = (input) =>
  spawnSync(process.execPath, [HOOK], { input: typeof input === 'string' ? input : JSON.stringify(input) }).status;

const allowed = [
  ['Read', { file_path: `${ROOT}playwright.config.ts` }],
  ['Read', { file_path: `${ROOT}.env.example` }],
  ['Write', { file_path: `${ROOT}tests/new_dir/a.spec.ts`, content: '' }],
  ['Glob', { pattern: 'tests/**/*.spec.ts' }],
  ['Grep', { pattern: '/pl/', path: 'tests' }],
  ['Bash', { command: 'npm test -- --reporter=line 2>/dev/null' }],
  ['Bash', { command: 'curl -sI https://testyautomatyczne.telemedi.com/pl' }],
  ['Bash', { command: 'ls tests/../playwright.config.ts' }],
  ['Bash', { command: `ls ${ROOT}tests` }],
  ['Bash', { command: 'echo "Loading..." && git diff HEAD~1' }],
  ['Bash', { command: 'npm test -- --grep booking' }],
  ['Bash', { command: 'npx playwright show-report' }],
  ['Bash', { command: 'env CI=1 npm test' }],
  ['Write', { file_path: `${ROOT}tests/auth.setup.ts`, content: 'process.env.TELEMEDI_PASSWORD' }],
  ['Write', { file_path: `${ROOT}tests/booking.spec.ts`, content: "await page.goto('/pl');" }],
];

const blocked = [
  ['Read', { file_path: '/etc/hosts' }],
  ['Read', { file_path: `${ROOT}.env` }],
  ['Read', { file_path: `${ROOT}../other/file.txt` }],
  ['Read', { file_path: `${ROOT.slice(0, -1)}-copy/file.txt` }],
  ['Write', { file_path: '/private/tmp/x.txt', content: '' }],
  ['Edit', { file_path: `${ROOT}.env`, old_string: 'a', new_string: 'b' }],
  ['Glob', { pattern: '/Users/**/CLAUDE.md' }],
  ['Grep', { pattern: 'x', path: '~/.claude' }],
  ['Bash', { command: 'cat ~/.claude/CLAUDE.md' }],
  ['Bash', { command: 'cat $HOME/.zshrc' }],
  ['Bash', { command: 'ls /Users' }],
  ['Bash', { command: 'cat ../notes.txt' }],
  ['Bash', { command: 'cd tests && cat ../../notes.txt' }],
  ['Bash', { command: 'cat $PWD/../notes.txt' }],
  ['Bash', { command: 'cd && ls' }],
  ['Bash', { command: 'cat file:///etc/hosts' }],
  ['Bash', { command: 'cp a.txt --target-directory=/tmp' }],
  ['Bash', { command: 'grep PASSWORD .env' }],
  ['Bash', { command: `node -e "process.loadEnvFile('.env')"` }],
  ['Read', { file_path: `${ROOT}playwright/.auth/user.json` }],
  ['Read', { file_path: `${ROOT}playwright-report/index.html` }],
  ['Bash', { command: 'unzip -p test-results/x/trace.zip' }],
  ['Bash', { command: 'cat playwright/.auth/user.json' }],
  ['Bash', { command: 'echo $TELEMEDI_PASSWORD' }],
  ['Bash', { command: 'node -p process.env' }],
  ['Bash', { command: 'printenv' }],
  ['Bash', { command: 'env | sort' }],
  ['Bash', { command: 'export -p' }],
  ['Bash', { command: 'npx playwright test --reporter=line' }],
  ['Bash', { command: 'node node_modules/@playwright/test/cli.js test' }],
  ['Write', { file_path: `${ROOT}tests/booking.spec.ts`, content: 'console.log(process.env.TELEMEDI_EMAIL)' }],
  ['Edit', { file_path: `${ROOT}tests/booking.spec.ts`, old_string: 'a', new_string: 'console.log(process.env)' }],
  ['Write', { file_path: `${ROOT}.scratch/x.mjs`, content: 'fs.writeFileSync("o", JSON.stringify(process.env))' }],
];

for (const [tool_name, tool_input] of allowed) {
  test(`allows ${tool_name} ${JSON.stringify(tool_input)}`, () => {
    assert.equal(exitCode({ tool_name, tool_input }), 0);
  });
}

for (const [tool_name, tool_input] of blocked) {
  test(`blocks ${tool_name} ${JSON.stringify(tool_input)}`, () => {
    assert.equal(exitCode({ tool_name, tool_input }), 2);
  });
}

test('blocks when hook input is not JSON (fail-closed)', () => {
  assert.equal(exitCode('not json'), 2);
});

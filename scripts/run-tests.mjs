// `npm test` entry point: runs Playwright and masks the .env credential values in its
// console output and in test-results/results.json, so they never reach an agent transcript.
import fs from 'node:fs';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
// TELEMEDI_OWN_*: the personal account used for the Task 2 exploration; masked too in case .env still holds it.
const secrets = ['TELEMEDI_EMAIL', 'TELEMEDI_PASSWORD', 'TELEMEDI_OWN_EMAIL', 'TELEMEDI_OWN_PASSWORD']
  .map((key) => process.env[key])
  .filter((value) => value && value.length >= 3)
  .flatMap((value) => [value, encodeURIComponent(value)]);
const mask = (text) => secrets.reduce((out, secret) => out.split(secret).join('***'), text);

// UI mode traces every test it runs, so playwright.config.ts leaves the login (setup project) out there.
if (process.argv.includes('--ui')) process.env.TELEMEDI_UI_MODE = '1';

const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const child = spawn(process.execPath, [cli, 'test', ...process.argv.slice(2)], { stdio: ['inherit', 'pipe', 'pipe'] });

// Line by line, so a secret is never split across two chunks.
for (const [from, to] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
  readline.createInterface({ input: from, crlfDelay: Infinity }).on('line', (line) => to.write(`${mask(line)}\n`));
}

// Text artifacts (results.json, error-context.md, stdout logs) get the same masking.
// Binary ones (trace.zip, videos, the HTML report) can't be masked; the agent's hook blocks reading them.
const TEXT_FILE = /\.(json|md|txt|log)$/;

child.on('close', (code) => {
  const files = fs.existsSync('test-results') ? fs.readdirSync('test-results', { recursive: true, withFileTypes: true }) : [];
  for (const entry of files) {
    if (!entry.isFile() || !TEXT_FILE.test(entry.name)) continue;
    const file = `${entry.parentPath}/${entry.name}`;
    fs.writeFileSync(file, mask(fs.readFileSync(file, 'utf8')));
  }
  process.exit(code ?? 1);
});

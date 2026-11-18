// PreToolUse guard, wired for every tool in .claude/settings.json.
// Blocks (exit 2, reason on stderr) tool input that points outside the project root,
// at the home/temp dir, or at .env. settings.json runs it as `node ... || exit 2`,
// so a crash or a missing node also blocks (fail-closed).
// These are text checks: they catch accidents, not deliberate obfuscation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Derived from this file's location, not from env, so it can't be redirected.
const ROOT = fs.realpathSync.native(fileURLToPath(new URL('../..', import.meta.url)));
const DEVICES = /^\/dev\/(null|stdin|stdout|stderr|tty|fd\/\d+)$/;
const PATH_KEYS = new Set(['file_path', 'file_paths', 'notebook_path', 'path', 'paths', 'glob', 'root', 'out_dir', 'cwd']);
// Shell word separators; ':' and '=' too, so PATH-like lists and --flag=/x get split.
const SEP = /[\s'"`=:,;&|<>(){}]+/;
const CREDENTIAL_VARS = /\bTELEMEDI_(EMAIL|PASSWORD)\b/;
// The only files that may name the credential variables.
const CREDENTIAL_FILES = new Set([
  'tests/auth.setup.ts',
  'scripts/run-tests.mjs',
  '.env.example',
  'CLAUDE.md',
  'README.md',
  '.claude/hooks/guard-paths.mjs',
  '.claude/hooks/guard-paths.test.mjs',
]);
const ENV_DUMP_CODE = /(JSON\.stringify|Object\.(keys|values|entries)|console\.\w+)\(\s*process\.env\s*\)|\.\.\.process\.env\b/;
const ENV_DUMP_SHELL = /(^|[;&|(]\s*)(printenv\b|env\s*($|[;&|)])|export\s*($|[;&|)]|\s+-p\b)|set\s*($|[;&|)])|declare\s+-x\b)/;
// Playwright must go through `npm test` (scripts/run-tests.mjs), which masks the credentials.
const DIRECT_PLAYWRIGHT = /\bplaywright\s+test\b|@playwright\/test\/cli|playwright\/cli\.js/;

function block(reason) {
  process.stderr.write(`Blocked by .claude/hooks/guard-paths.mjs: ${reason}. Work only inside ${ROOT} and never touch .env.\n`);
  process.exit(2);
}

// Unmaskable artifacts that can hold credentials: the saved session, traces, the HTML report.
const UNMASKED_ARTIFACT = /(^|\/)(playwright\/\.auth|playwright-report)(\/|$)|\.zip$/;

// The user fills .env with credentials; only the template may be touched.
function isSecret(p) {
  const base = path.basename(p);
  return (/^\.env(\..+)?$/.test(base) && base !== '.env.example') || UNMASKED_ARTIFACT.test(p);
}

// Resolve symlinks on the longest existing prefix, so a link can't lead out of the project.
function realish(abs) {
  const rest = [];
  for (let cur = abs; ; cur = path.dirname(cur)) {
    try {
      return path.join(fs.realpathSync.native(cur), ...rest);
    } catch {
      if (path.dirname(cur) === cur) return abs;
      rest.unshift(path.basename(cur));
    }
  }
}

const within = (p) => p === ROOT || p.startsWith(ROOT + path.sep);

// Relative paths resolve from ROOT: the shallowest dir inside the project, so the strictest.
// Outside paths are rejected on the string alone; the filesystem is only touched inside ROOT.
function isInside(p) {
  if (DEVICES.test(p)) return true;
  const abs = path.resolve(ROOT, p);
  return within(abs) && within(realish(abs));
}

function checkPath(value, label) {
  if (typeof value !== 'string' || value === '') return;
  if (/^~|\$\{?(HOME|TMPDIR)\b/.test(value)) block(`${label} points at the home/temp dir`);
  // Only the static prefix of a glob matters: src/**/*.ts -> src/
  const prefix = value.split(/[*?[{]/)[0] || '.';
  if (!isInside(prefix)) block(`${label} is outside the project`);
  if (isSecret(value)) block(`${label} is a secrets file`);
}

function checkCommand(cmd) {
  // Web URLs are not local paths; file:// stays in and gets checked.
  const text = cmd.replace(/\b(?:https?|wss?|ftp):\/\/[^\s'"`]+/gi, ' ');
  if (/(^|[\s'"`=:(])~/.test(text)) block('command references ~ (home dir)');
  if (/\$\{?(HOME|TMPDIR|OLDPWD)\b/.test(text)) block('command references $HOME/$TMPDIR/$OLDPWD');
  // A bare `cd` jumps home, `cd -` to the previous dir.
  if (/(^|[;&|(]\s*)cd(\s+-)?\s*($|[;&|)])/.test(text)) block('bare `cd` leaves the project');
  if (CREDENTIAL_VARS.test(text) || /\bprocess\.env\b/.test(text)) block('command reads the credential variables');
  if (ENV_DUMP_SHELL.test(text)) block('command dumps environment variables');
  if (DIRECT_PLAYWRIGHT.test(text)) block('run Playwright via `npm test` (masks credentials), not directly');
  for (const word of text.split(SEP)) {
    if (!word) continue;
    const dotdot = /(^|\/)\.\.(\/|$)/.test(word);
    if (dotdot && word.includes('$')) block(`command builds a path from a variable and "..": ${word}`);
    if ((word.startsWith('/') || dotdot) && !isInside(word)) block(`command touches ${word}, outside the project`);
    if (isSecret(word)) block(`command references secrets file ${word}`);
  }
}

// Code written by the agent must not expose the credentials it can't read.
function checkContent(args) {
  if (typeof args.file_path !== 'string') return;
  const text = [args.content, args.new_string, args.new_source, ...(args.edits ?? []).map((e) => e.new_string)]
    .filter((t) => typeof t === 'string')
    .join('\n');
  const rel = path.relative(ROOT, path.resolve(ROOT, args.file_path));
  if (CREDENTIAL_VARS.test(text) && !CREDENTIAL_FILES.has(rel)) block(`${rel} may not reference the credential variables`);
  // The guard's own files hold these patterns as test cases; edits there need user approval anyway.
  if (ENV_DUMP_CODE.test(text) && !rel.startsWith('.claude/hooks/')) block(`${rel} would dump process.env`);
}

let input;
try {
  input = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
  block('unreadable hook input');
}
const tool = input.tool_name;
const args = input.tool_input ?? {};
if (typeof args.command === 'string') checkCommand(args.command);
checkContent(args);
for (const [key, value] of Object.entries(args)) {
  if (PATH_KEYS.has(key)) [value].flat().forEach((v) => checkPath(v, `${tool}.${key}`));
}
if (tool === 'Glob') checkPath(args.pattern, 'Glob.pattern');

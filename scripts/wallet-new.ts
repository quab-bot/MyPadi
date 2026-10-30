/**
 * Generate the dedicated MyPadi agent wallet.
 *
 *   npm run wallet-new                 generate key -> write .env (AGENT_PRIVATE_KEY, AGENT_WALLET),
 *                                      print the address and the paste-ready buy import steps.
 *   npm run wallet-new -- --import-sandbox
 *                                      additionally import the key into the buy FILE keystore on
 *                                      Celo Sepolia (sandbox) and set the daily cap. Phase 1 safe:
 *                                      no funding, no mainnet. The first sandbox curl auto-funds.
 *   npm run wallet-new -- --force      overwrite an existing key in .env (DANGER: a funded key is lost).
 *
 * The private key is written ONLY to the local, gitignored .env and (on import) the buy keystore.
 * It is never printed to the console.
 */

import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const ENV_PATH = join(repoRoot, '.env');

function readArg(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

/** Set (or append) a KEY=value line in the .env text. */
function setEnvLine(text: string, key: string, value: string): string {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, `${key}=${value}`);
  return text.endsWith('\n') ? `${text}${key}=${value}\n` : `${text}\n${key}=${value}\n`;
}

function currentValue(text: string, key: string): string {
  const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return (m?.[1] ?? '').trim();
}

async function spawnBuy(args: string[], extraEnv: Record<string, string>): Promise<number> {
  const entry = process.env.BUY_ENTRY;
  const bin = process.env.BUY_BIN ?? 'buy';
  const command = entry ? process.execPath : bin;
  const argv = entry ? [entry, ...args] : args;
  return new Promise((resolve) => {
    const child = spawn(command, argv, {
      cwd: repoRoot,
      env: { ...process.env, ...extraEnv },
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    });
    child.on('close', (code) => resolve(code ?? -1));
  });
}

async function main(): Promise<void> {
  const force = readArg('--force');
  const importSandbox = readArg('--import-sandbox');

  let envText = await readFile(ENV_PATH, 'utf8').catch(() => '');
  const existing = currentValue(envText, 'AGENT_PRIVATE_KEY');
  if (existing && !force) {
    console.error('AGENT_PRIVATE_KEY is already set in .env. Refusing to overwrite. Use --force to replace.');
    process.exit(1);
  }

  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);

  envText = setEnvLine(envText, 'AGENT_PRIVATE_KEY', key);
  envText = setEnvLine(envText, 'AGENT_WALLET', account.address);
  await writeFile(ENV_PATH, envText, 'utf8');

  // buy's file keystore refuses to sign on Windows (it demands a POSIX 0600 key file, which
  // Windows cannot represent), so local Windows uses the OS keychain and only the Linux VPS
  // uses the file backend. See .env.example and memory buy-keystore-windows.
  const isWindows = process.platform === 'win32';
  const keystoreEnv: Record<string, string> = isWindows
    ? {} // default = OS keychain (Windows Credential Manager)
    : { BUY_KEYSTORE_BACKEND: 'file', BUY_HOME: process.env.BUY_HOME ?? './buy-home' };

  console.log('New MyPadi wallet generated.');
  console.log(`  address: ${account.address}`);
  console.log('  key:     written to .env (AGENT_PRIVATE_KEY), not shown here');
  console.log('');
  console.log(`To import it into the buy keystore yourself (key read from BUY_IMPORT_KEY env, never an arg):`);
  if (isWindows) {
    console.log('  PowerShell (Windows -> OS keychain, the file backend cannot sign here):');
    console.log('    $env:BUY_IMPORT_KEY="<AGENT_PRIVATE_KEY from .env>"');
    console.log('    buy --sandbox setup --import --name mypadi --network sepolia   # sandbox (Phase 1)');
    console.log('    buy --sandbox account cap mypadi 1.00');
  } else {
    console.log('  Linux/macOS (file backend):');
    console.log('    export BUY_KEYSTORE_BACKEND=file BUY_HOME=./buy-home');
    console.log('    export BUY_IMPORT_KEY="<AGENT_PRIVATE_KEY from .env>"');
    console.log('    buy --sandbox setup --import --name mypadi --network sepolia   # sandbox (Phase 1)');
    console.log('    buy --sandbox account cap mypadi 1.00');
  }
  console.log('  (Phase 2 mainnet uses --network mainnet, without --sandbox.)');

  if (importSandbox) {
    console.log(
      `\n--import-sandbox: importing into the sandbox ${isWindows ? 'OS keychain' : 'file keystore'}...`,
    );
    const env = { ...keystoreEnv, BUY_IMPORT_KEY: key };
    const setupCode = await spawnBuy(
      ['--sandbox', 'setup', '--import', '--name', 'mypadi', '--network', 'sepolia', '--force'],
      env,
    );
    if (setupCode !== 0) {
      console.error(`buy setup --import exited ${setupCode}`);
      process.exit(setupCode);
    }
    const capCode = await spawnBuy(['--sandbox', 'account', 'cap', 'mypadi', '1.00'], env);
    if (capCode !== 0) console.error(`buy account cap exited ${capCode} (non-fatal)`);
    console.log('Sandbox wallet imported as account "mypadi" with a 1.00 daily cap.');
  }
}

main().catch((err) => {
  console.error('wallet-new failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

import { loadEnvFile } from 'node:process';

/** Load optional local settings; existing environment variables take precedence. */
export function loadLocalEnvironment(): void {
  try {
    loadEnvFile('.env');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    // Parsing errors must never quote a credential-containing line.
    throw new Error('Could not load the local .env file. Check its format and permissions.');
  }
}

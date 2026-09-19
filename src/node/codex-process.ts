import { spawn, type ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';

interface CodexProcessOptions {
  executable: string;
  args: string[];
  cwd: string;
  output: string;
  prompt: string;
  signal?: AbortSignal;
  timeoutMs: number;
  maxOutputBytes: number;
}

/** Own process lifetime, cancellation and output bounds without exposing provider output. */
export function runCodexProcess(options: CodexProcessOptions): Promise<void> {
  const { executable, args, cwd, output, prompt, signal, timeoutMs, maxOutputBytes } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Codex generation was cancelled.'));
      return;
    }
    const child = spawn(executable, args, {
      cwd,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let failure: Error | undefined;
    let bytes = 0;
    const stop = (message: string) => {
      if (failure) {
        return;
      }
      failure = new Error(message);
      terminateProcess(child);
    };
    const timer = setTimeout(() => stop('Codex generation timed out.'), timeoutMs);
    const monitorOutputFile = () => {
      void stat(output)
        .then((info) => {
          if (info.size > maxOutputBytes) {
            stop('Codex structured response exceeded the configured output limit.');
          }
        })
        .catch(() => {});
    };
    const monitor = setInterval(monitorOutputFile, 100);
    const cancelled = () => stop('Codex generation was cancelled.');
    signal?.addEventListener('abort', cancelled, { once: true });
    const countProcessOutput = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) {
        stop('Codex process exceeded the configured output limit.');
      }
    };
    child.stdout.on('data', countProcessOutput);
    child.stderr.on('data', countProcessOutput);
    child.stdin.on('error', () => {
      // Process errors and exit status provide safe diagnostics without provider output.
    });
    child.on('error', () => {
      failure ??= new Error(
        'Codex could not start. Install Codex and run codex login before generating.',
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      clearInterval(monitor);
      signal?.removeEventListener('abort', cancelled);
      if (failure) {
        reject(failure);
      } else if (code !== 0) {
        reject(
          new Error(
            `Codex failed with exit status ${code ?? 'unknown'}. ` +
              'Check codex login status and the configured model. ' +
              'Provider output was omitted to protect secrets.',
          ),
        );
      } else {
        resolve();
      }
    });
    child.stdin.end(prompt);
  });
}

function terminateProcess(child: ChildProcess): void {
  try {
    if (process.platform !== 'win32' && child.pid) {
      process.kill(-child.pid, 'SIGKILL');
    } else {
      child.kill('SIGKILL');
    }
  } catch {
    child.kill('SIGKILL');
  }
}

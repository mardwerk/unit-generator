import { spawn, type ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { ModelExecutionError, type ModelFailure } from '../core/model.js';

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
      reject(codexFailure({ code: 'CANCELLED', message: 'Codex generation was cancelled.' }));
      return;
    }
    const child = spawn(executable, args, {
      cwd,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let failure: ModelExecutionError | undefined;
    let bytes = 0;
    const stop = (reason: Omit<ModelFailure, 'provider'>) => {
      if (failure) {
        return;
      }
      failure = codexFailure(reason);
      terminateProcess(child);
    };
    const timer = setTimeout(
      () =>
        stop({
          code: 'LOCAL_TIMEOUT',
          timeoutMs,
          message: `Codex generation timed out at the app's ${timeoutMs / 1000}-second limit. Retry this stage or choose a faster model.`,
        }),
      timeoutMs,
    );
    const monitorOutputFile = () => {
      void stat(output)
        .then((info) => {
          if (info.size > maxOutputBytes) {
            stop({
              code: 'OUTPUT_LIMIT',
              message: 'Codex structured response exceeded the configured output limit.',
            });
          }
        })
        .catch(() => {});
    };
    const monitor = setInterval(monitorOutputFile, 100);
    const cancelled = () => stop({ code: 'CANCELLED', message: 'Codex generation was cancelled.' });
    signal?.addEventListener('abort', cancelled, { once: true });
    const countProcessOutput = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxOutputBytes) {
        stop({
          code: 'OUTPUT_LIMIT',
          message: 'Codex process exceeded the configured output limit.',
        });
      }
    };
    child.stdout.on('data', countProcessOutput);
    child.stderr.on('data', countProcessOutput);
    child.stdin.on('error', () => {
      // Process errors and exit status provide safe diagnostics without provider output.
    });
    child.on('error', () => {
      failure ??= codexFailure({
        code: 'MODEL_FAILED',
        message: 'Codex could not start. Install Codex and run codex login before generating.',
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      clearInterval(monitor);
      signal?.removeEventListener('abort', cancelled);
      if (failure) {
        reject(failure);
      } else if (code !== 0) {
        reject(
          codexFailure({
            code: 'MODEL_FAILED',
            message:
              `Codex failed with exit status ${code ?? 'unknown'}. ` +
              'Check codex login status and the configured model. ' +
              'Provider output was omitted to protect secrets.',
          }),
        );
      } else {
        resolve();
      }
    });
    child.stdin.end(prompt);
  });
}

/** Only deliberate adapter messages belong in this safe failure record. */
export function codexFailure(failure: Omit<ModelFailure, 'provider'>): ModelExecutionError {
  return new ModelExecutionError(failure.message, undefined, {
    failure: { ...failure, provider: 'Codex' },
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

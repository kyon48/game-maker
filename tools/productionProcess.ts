import { spawn } from 'node:child_process';
/** A production stage may spawn its own tools; cancellation stops the entire group. */
export async function productionProcess(file: string, args: string[], signal?: AbortSignal): Promise<{ stdout: string; stderr: string }> {
  signal?.throwIfAborted();
  const child = spawn(file, args, { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  const stop = () => {
    if (!child.pid) return;
    try { if (process.platform === 'win32') child.kill(); else process.kill(-child.pid, 'SIGTERM'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  };
  signal?.addEventListener('abort', stop);
  try {
    return await new Promise((resolve, reject) => {
      child.stdout.on('data', bytes => { stdout += String(bytes); if (stdout.length > 16 * 1024 * 1024) { stop(); reject(new Error('Production stdout exceeds 16 MiB')); } });
      child.stderr.on('data', bytes => { stderr += String(bytes); if (stderr.length > 16 * 1024 * 1024) { stop(); reject(new Error('Production stderr exceeds 16 MiB')); } });
      child.once('error', reject);
      child.once('close', code => code === 0 && !signal?.aborted ? resolve({ stdout, stderr }) : reject(Object.assign(new Error(`Production stage failed: ${file} (exit ${code})`), { stdout, stderr })));
      if (signal?.aborted) stop();
    });
  } finally { signal?.removeEventListener('abort', stop); stop(); }
}

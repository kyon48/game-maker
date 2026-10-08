import ffmpeg from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
export function videoFilter(width: number, height: number): string {
  const scale = Math.floor(Math.min(1920 / width, 1080 / height));
  if (scale < 1) throw new Error('Logical screen exceeds 1920×1080');
  return `scale=${width * scale}:${height * scale}:flags=neighbor,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`;
}
export function encoder(width: number, height: number, fps: number, output: string) {
  if (!ffmpeg) throw new Error('ffmpeg-static does not provide a binary for this platform');
  const process = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${width}x${height}`, '-framerate', String(fps), '-i', 'pipe:0', '-an', '-vf', videoFilter(width, height), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-threads', '2', '-movflags', '+faststart', output], { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '', failed: Error | null = null;
  process.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); });
  process.stdin.on('error', error => { failed = error; });
  const completion = new Promise<void>((resolve, reject) => {
    process.on('error', reject);
    process.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr}`)));
  });
  // Attach an early rejection handler while frames are still being written.
  void completion.catch(error => { failed = error; });
  return {
    async write(bytes: Buffer) {
      if (bytes.length !== width * height * 4) throw new Error('Incorrect RGBA frame size');
      if (failed) throw failed;
      if (!process.stdin.write(bytes)) await once(process.stdin, 'drain');
      if (failed) throw failed;
    },
    async finish() { process.stdin.end(); await completion; },
    async abort() { process.kill(); await completion.catch(() => {}); },
  };
}

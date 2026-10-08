import { recordFilm } from './film/record';
try {
  const [pack, name, ...args] = process.argv.slice(2);
  if (!pack || !name) throw new Error('Usage: film <packId> <film> [--fps 30|60] [--chapter title] [--out dir]');
  const options: { fps?: 30 | 60; chapter?: string; out?: string } = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!value) throw new Error(`Missing option value: ${key}`);
    if (key === '--fps' && (value === '30' || value === '60')) options.fps = Number(value) as 30 | 60;
    else if (key === '--chapter') options.chapter = value;
    else if (key === '--out') options.out = value;
    else throw new Error(`Invalid option: ${key} ${value}`);
  }
  await recordFilm(pack, name, options);
} catch (error) { console.error(String(error)); process.exitCode = 1; }

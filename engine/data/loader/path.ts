export function packPath(from: string, reference: string): string {
  if (!reference || /[\\?#:]/.test(reference) || reference.startsWith('/')) throw new Error(`Invalid pack path: ${reference}`);
  const parts = from.split('/').slice(0, -1);
  for (const part of reference.split('/')) {
    if (part === '..') { if (!parts.length) throw new Error(`Path escapes pack: ${reference}`); parts.pop(); }
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

import type { BuildInfo } from '../data/buildInfo';
import type { Diagnostic } from '../data/validator/types';
export class PackValidationError extends Error {
  constructor(readonly diagnostics: readonly Diagnostic[]) { super('Pack validation failed'); }
}
export function showError(app: HTMLElement, error: unknown, buildInfo: BuildInfo | null = null): void {
  const overlay = document.createElement('section'); overlay.setAttribute('role', 'alert');
  const heading = document.createElement('h1'); heading.textContent = 'Game error';
  const output = document.createElement('pre');
  output.textContent = error instanceof PackValidationError
    ? error.diagnostics.map(item => `${item.file}${item.pointer} ${item.level} ${item.code}: ${item.message}`).join('\n') : String(error);
  const info = document.createElement('pre'); info.textContent = buildInfo ? 'build-info: ' + JSON.stringify(buildInfo, null, 2) : 'build-info: development';
  overlay.append(heading, output, info); app.replaceChildren(overlay);
}

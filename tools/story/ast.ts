export interface Source { file: string; line: number }
export interface Diagnostic extends Source { code: string; level: 'error' | 'warning'; message: string }
export type Condition =
  | { kind: 'flag'; name: string; enabled: boolean }
  | { kind: 'variable'; name: string; op: '==' | '!=' | '<' | '<=' | '>' | '>='; value: number }
  | { kind: 'all' | 'any'; conditions: Condition[] };
export interface Destination { location: string; anchor: string }
export type Dir = 'up' | 'down' | 'left' | 'right';
export type Statement = Source & (
  | { kind: 'dialogue'; speaker?: string; expression?: string; text: string }
  | { kind: 'narration'; text: string }
  | { kind: 'choice'; prompt: string; options: Option[] }
  | { kind: 'if'; condition: Condition; then: Statement[]; else: Statement[] }
  | { kind: 'set' | 'unset'; flag: string }
  | { kind: 'add' | 'sub'; variable: string; amount: number }
  | { kind: 'go'; destination: Destination; dir?: Dir }
  | { kind: 'move'; target: string; route: string[] }
  | { kind: 'face'; target: string; dir: Dir | 'player' }
  | { kind: 'fade'; to: 'black' | 'clear'; frames: number }
  | { kind: 'wait'; frames: number }
  | { kind: 'shake' | 'waitNarration' }
  | { kind: 'call'; common: string }
  | { kind: 'filmPause'; seconds: number }
  | { kind: 'filmWalkTo'; anchor: string }
  | { kind: 'cmd'; value: unknown }
);
export interface Option extends Source { label: string; chosen: boolean; statements: Statement[] }
export interface Page extends Source { condition?: Condition; statements: Statement[] }
export interface Event extends Source { kind: 'event'; id: string; anchor: string; trigger: 'action' | 'auto' | 'touch'; once: boolean; character?: string; wander?: string[]; pages: Page[] }
export interface Scene extends Source { title: string; location: string; chapter?: string; items: (Event | Statement)[] }
export interface Anchor extends Source { character: string; name: string; destination?: Destination }
export interface Location extends Source { id: string; name: string; layout?: { file: string; line: number; rows: (Source & { text: string })[] }; anchors: Anchor[] }
export type Header = Source & (
  | { kind: 'pack'; id: string; title: string }
  | { kind: 'player'; id: string }
  | { kind: 'screen'; width: number; height: number }
);
export interface Story extends Source {
  headers: Header[];
  characters: (Source & { id: string; name: string; art?: string; voice?: string })[];
  flags: (Source & { name: string })[];
  variables: (Source & { name: string; initial: number })[];
  locations: Location[];
  chapters: (Source & { title: string })[];
  scenes: Scene[];
  common: (Source & { id: string; statements: Statement[] })[];
}

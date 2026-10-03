export type Condition =
  | { flag: string; is: boolean }
  | { var: string; op: '==' | '!=' | '>' | '>=' | '<' | '<='; value: number }
  | { self: string; is: boolean }
  | { all: Condition[] } | { any: Condition[] } | { not: Condition }
  | { plugin: string; args: Record<string, unknown> };
export interface Command { cmd: string; [name: string]: unknown }

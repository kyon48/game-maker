import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { ScenarioSchema } from './scenario';
import { Id, Nonnegative, objectOptions } from './primitives';
const seconds = Type.Number({ minimum: 0, maximum: 3600 });
const scenarioSteps = ScenarioSchema.properties.steps.items.anyOf;
export const FilmSchema = Type.Object({
  ...ScenarioSchema.properties,
  fps: Type.Optional(Type.Union([Type.Literal(30), Type.Literal(60)])),
  readingSpeed: Type.Optional(Type.Object({
    base: Type.Optional(seconds), perCharacter: Type.Optional(Type.Number({ minimum: 0, maximum: 10 })),
  }, objectOptions)),
  steps: Type.Array(Type.Union([
    ...scenarioSteps,
    Type.Object({ narrate: Type.String({ minLength: 1 }), wait: Type.Optional(Type.Boolean()), cue: Type.Optional(Id) }, objectOptions),
    Type.Object({ waitNarration: Type.Literal(true), cue: Type.Optional(Id) }, objectOptions),
    Type.Object({ music: Type.Object({ file: Type.String({ minLength: 1 }), volume: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })), fadeIn: Type.Optional(seconds), loop: Type.Optional(Type.Literal(true)) }, objectOptions) }, objectOptions),
    Type.Object({ music: Type.Null(), fadeOut: Type.Optional(seconds) }, objectOptions),
    Type.Object({ waitFor: Type.Literal('message') }, objectOptions),
    Type.Object({ pause: seconds }, objectOptions),
    Type.Object({ walkTo: Type.Union([
      Type.Object({ event: Id }, objectOptions),
      Type.Object({ x: Nonnegative, y: Nonnegative }, objectOptions),
    ]), speed: Type.Optional(Type.Literal('normal')) }, objectOptions),
    Type.Object({ advanceText: Type.Union([Type.Literal('press'), Type.Literal('auto'), Type.Literal('voice')]), count: Type.Optional(Type.Literal(1)) }, objectOptions),
    Type.Object({ choose: Nonnegative, dwell: Type.Optional(seconds) }, objectOptions),
    Type.Object({ chapter: Type.String({ minLength: 1, pattern: '^[^\\r\\n]+$' }) }, objectOptions),
  ])),
}, objectOptions);
export type Film = Static<typeof FilmSchema>;
export type FilmStep = Film['steps'][number];
export type FilmExpect = Extract<FilmStep, { expect: unknown }>['expect'];

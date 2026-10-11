import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Id, objectOptions } from './schema/primitives';
export const ItemCategory = Type.Union([Type.Literal('item'), Type.Literal('clue')]);
export const ItemsSchema = Type.Record(Id, Type.Object({ name: Type.String({ minLength: 1, pattern: '\\S' }), description: Type.String(), icon: Type.Optional(Type.String({ minLength: 1 })), category: ItemCategory }, objectOptions), objectOptions);
export type Items = Static<typeof ItemsSchema>;
export type Category = 'item' | 'clue';
/** The result is message source text: inserted names/braces cannot become G1 controls. */
export function itemNotice(template: string, name: string, count: number): string {
  const escape = (s: string) => s.replace(/[{}]/g, brace => brace + brace);
  return template.replace(/\{\{|\}\}|\{[^{}]*\}|[{}]/g, token => {
    if (token === '{{' || token === '}}') return token;
    if (token === '{name}') return escape(name);
    if (token === '{count}') return String(count);
    throw new Error(`Unknown itemGet placeholder: ${token}`);
  });
}
export const menuLabelKeys = ['menuItems', 'menuClues', 'menuClose', 'menuEmpty'] as const;

import { describe, expect, it } from 'vitest';
import { ItemSchema, ItemVariantSchema, type Item, type ItemVariant } from '../src/index.js';

const rubric = [{ id: 'c1', text: 'Multiplies 3 by 4' }, { id: 'c2', text: 'States 12', evidenceHint: 'the number 12' }, { id: 'c3', text: 'Gives units' }];

const base: Item = {
  id: 'item-1', conceptId: 'concept-1', type: 'apply', bloom: 'apply',
  prompt: 'A box holds 3 rows of 4 eggs. How many eggs?',
  reference: { answer: '3 x 4 = 12 eggs', exact: '12' },
  rubric, spans: [], generatorVersion: 'hand-authored', hash: 'h',
};

const variants: ItemVariant[] = [
  {
    id: 'item-1~v1', prompt: 'A shelf holds 5 rows of 6 jars. How many jars?',
    reference: { answer: '5 x 6 = 30 jars', exact: '30' },
    rubric: [{ id: 'c1', text: 'Multiplies 5 by 6' }, { id: 'c2', text: 'States 30' }, { id: 'c3', text: 'Gives units' }],
  },
  {
    id: 'item-1~v2', prompt: 'A car park has 7 rows of 8 bays. How many bays?',
    reference: { answer: '7 x 8 = 56 bays', exact: '56', notes: 'accept 56 spaces' },
    rubric: [{ id: 'c1', text: 'Multiplies 7 by 8' }, { id: 'c2', text: 'States 56' }, { id: 'c3', text: 'Gives units' }],
  },
];

describe('ItemSchema variants', () => {
  it('accepts an item without variants (unchanged packs still validate)', () => {
    const r = ItemSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.success && r.data.variants).toBeUndefined();
  });

  it('accepts an item with variants and keeps them through a parse', () => {
    const r = ItemSchema.safeParse({ ...base, variants });
    expect(r.success).toBe(true);
    expect(r.success && r.data.variants).toEqual(variants);
  });

  it('rejects a malformed variant', () => {
    expect(ItemSchema.safeParse({ ...base, variants: [{ ...variants[0]!, prompt: '' }] }).success).toBe(false);
    expect(ItemSchema.safeParse({ ...base, variants: [{ id: 'x', prompt: 'p', reference: { answer: 'a' } }] }).success).toBe(false);
    expect(ItemVariantSchema.safeParse({ ...variants[0]!, reference: {} }).success).toBe(false);
  });
});

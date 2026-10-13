/**
 * Zod schemas for each Architect stage's structured output. These describe what
 * the model returns; the pipeline turns them into core content types (adding
 * ids, hashes and validated spans).
 */
import { z } from 'zod';
import { BloomSchema, ItemTypeSchema } from '@epistemics/core';

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

export const OutlineLessonSchema = z.object({
  title: z.string().min(1),
  summary: z.string().default(''),
  /** Source chunk ids this lesson covers (empty without sources). */
  chunkIds: z.array(z.string()).default([]),
});

export const OutlineUnitSchema = z.object({
  title: z.string().min(1),
  summary: z.string().default(''),
  lessons: z.array(OutlineLessonSchema).min(1),
});

export const OutlineOutputSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  /** Textbook-style references the outline assumes (subject-only builds). */
  assumedReferences: z.array(z.string()).default([]),
  units: z.array(OutlineUnitSchema).min(1),
});
export type OutlineOutput = z.infer<typeof OutlineOutputSchema>;

// ---------------------------------------------------------------------------
// Concepts
// ---------------------------------------------------------------------------

export const SpanOutputSchema = z.object({
  chunkId: z.string(),
  quote: z.string().min(1),
  page: z.number().int().optional(),
  heading: z.string().optional(),
});

export const ConceptOutputSchema = z.object({
  name: z.string().min(1),
  definition: z.string().min(1),
  objectives: z.array(z.object({ bloom: BloomSchema, text: z.string().min(1) })).min(1),
  misconceptions: z.array(z.object({ tag: z.string().min(1), description: z.string(), remedy: z.string() })).default([]),
  examples: z.array(z.object({ title: z.string(), body: z.string(), domain: z.string().optional() })).default([]),
  spans: z.array(SpanOutputSchema).default([]),
});

export const ConceptsOutputSchema = z.object({
  concepts: z.array(ConceptOutputSchema).min(1),
});
export type ConceptsOutput = z.infer<typeof ConceptsOutputSchema>;
export type ConceptOutput = z.infer<typeof ConceptOutputSchema>;

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------

export const EdgeOutputSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.enum(['prereq', 'encompasses']),
  justification: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0.5),
  weight: z.number().min(0).max(1).optional(),
});

export const GraphOutputSchema = z.object({
  edges: z.array(EdgeOutputSchema),
});
export type GraphOutput = z.infer<typeof GraphOutputSchema>;

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

export const ScriptOutputSchema = z.object({
  pretest: z.object({ prompt: z.string().min(1), isomorph: z.string().min(1), reference: z.string().min(1) }),
  guidingQuestions: z
    .array(z.object({ question: z.string().min(1), expected: z.string().min(1), probesMisconception: z.string().optional() }))
    .min(3)
    .max(6),
  workedExample: z.object({ problem: z.string().min(1), steps: z.array(z.string().min(1)).min(1) }),
  transfer: z.object({ prompt: z.string().min(1), reference: z.string().min(1) }),
  hints: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
});
export type ScriptOutput = z.infer<typeof ScriptOutputSchema>;

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export const ItemOutputSchema = z.object({
  type: ItemTypeSchema,
  bloom: BloomSchema,
  prompt: z.string().min(1),
  reference: z.object({ answer: z.string().min(1), exact: z.string().optional(), notes: z.string().optional() }),
  rubric: z.array(z.object({ text: z.string().min(1), evidenceHint: z.string().optional() })).default([]),
  spans: z.array(SpanOutputSchema).default([]),
  tags: z.array(z.string()).optional(),
});

export const ItemsOutputSchema = z.object({
  items: z.array(ItemOutputSchema).min(1),
});
export type ItemsOutput = z.infer<typeof ItemsOutputSchema>;
export type ItemOutput = z.infer<typeof ItemOutputSchema>;

// ---------------------------------------------------------------------------
// Item check
// ---------------------------------------------------------------------------

export const ItemCheckResultSchema = z.object({
  index: z.number().int().min(0),
  attemptedAnswer: z.string().default(''),
  answerable: z.boolean(),
  ambiguous: z.boolean(),
  issues: z.array(z.string()).default([]),
  suggestedFix: z.string().optional(),
});

export const ItemCheckOutputSchema = z.object({
  results: z.array(ItemCheckResultSchema),
});
export type ItemCheckOutput = z.infer<typeof ItemCheckOutputSchema>;

// ---------------------------------------------------------------------------
// Variants (isomorphs of apply items) and their verification
// ---------------------------------------------------------------------------

export const VariantOutputSchema = z.object({
  prompt: z.string().min(1),
  reference: z.object({ answer: z.string().min(1), exact: z.string().optional(), notes: z.string().optional() }),
  /** Same criterion ids, count and order as the original item's rubric (checked in code). */
  rubric: z.array(z.object({ id: z.string().min(1), text: z.string().min(1), evidenceHint: z.string().optional() })),
});

export const VariantsOutputSchema = z.object({
  variants: z.array(VariantOutputSchema),
});
export type VariantsOutput = z.infer<typeof VariantsOutputSchema>;
export type VariantOutput = z.infer<typeof VariantOutputSchema>;

/** Independent solve of a variant prompt (the reference is not shown). */
export const VariantSolveOutputSchema = z.object({
  work: z.string().default(''),
  finalAnswer: z.string(),
  solvable: z.boolean().default(true),
});
export type VariantSolveOutput = z.infer<typeof VariantSolveOutputSchema>;

/** Judge: does the independent solution agree with the reference in substance (variants without `exact`). */
export const VariantJudgeOutputSchema = z.object({
  agrees: z.boolean(),
  reason: z.string().default(''),
});
export type VariantJudgeOutput = z.infer<typeof VariantJudgeOutputSchema>;

export const STAGE_SCHEMAS = {
  outline: OutlineOutputSchema,
  concepts: ConceptsOutputSchema,
  graph: GraphOutputSchema,
  scripts: ScriptOutputSchema,
  items: ItemsOutputSchema,
  itemcheck: ItemCheckOutputSchema,
  variants: VariantsOutputSchema,
  variantsolve: VariantSolveOutputSchema,
  variantjudge: VariantJudgeOutputSchema,
} as const;

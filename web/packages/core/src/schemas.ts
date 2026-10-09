/** Zod schemas for content validation (packs, generator outputs). Kept in sync with types.ts. */
import { z } from 'zod';

export const BloomSchema = z.enum(['remember', 'understand', 'apply', 'analyze']);
export const ItemTypeSchema = z.enum(['recall', 'cloze', 'explain', 'apply', 'discriminate', 'map', 'teachback', 'predict']);

export const ObjectiveSchema = z.object({ id: z.string(), bloom: BloomSchema, text: z.string().min(1) });
export const MisconceptionSchema = z.object({ tag: z.string().min(1), description: z.string(), remedy: z.string() });
export const ExampleSchema = z.object({ title: z.string(), body: z.string(), domain: z.string().optional() });
export const SourceSpanSchema = z.object({ chunkId: z.string(), quote: z.string(), page: z.number().optional(), heading: z.string().optional() });
export const RubricCriterionSchema = z.object({ id: z.string(), text: z.string().min(1), evidenceHint: z.string().optional() });

export const ItemSchema = z.object({
  id: z.string(),
  conceptId: z.string(),
  type: ItemTypeSchema,
  bloom: BloomSchema,
  prompt: z.string().min(1),
  reference: z.object({ answer: z.string().min(1), exact: z.string().optional(), notes: z.string().optional() }),
  rubric: z.array(RubricCriterionSchema),
  spans: z.array(SourceSpanSchema),
  tags: z.array(z.string()).optional(),
  generatorVersion: z.string(),
  hash: z.string(),
});

export const GuidingQuestionSchema = z.object({ question: z.string(), expected: z.string(), probesMisconception: z.string().optional() });

export const ConceptScriptSchema = z.object({
  pretest: z.object({ prompt: z.string(), isomorph: z.string(), reference: z.string() }),
  guidingQuestions: z.array(GuidingQuestionSchema).min(1),
  workedExample: z.object({ problem: z.string(), steps: z.array(z.string()).min(1) }),
  transfer: z.object({ prompt: z.string(), reference: z.string() }),
  hints: z.tuple([z.string(), z.string(), z.string()]),
});

export const ConceptSchema = z.object({
  id: z.string(),
  ordinal: z.number().int(),
  name: z.string().min(1),
  definition: z.string().min(1),
  objectives: z.array(ObjectiveSchema).min(1),
  misconceptions: z.array(MisconceptionSchema),
  examples: z.array(ExampleSchema),
  spans: z.array(SourceSpanSchema),
  script: ConceptScriptSchema,
  items: z.array(ItemSchema),
});

export const LessonSchema = z.object({
  id: z.string(), ordinal: z.number().int(), title: z.string().min(1), summary: z.string().optional(),
  concepts: z.array(ConceptSchema).min(1),
});

export const UnitSchema = z.object({
  id: z.string(), ordinal: z.number().int(), title: z.string().min(1), summary: z.string(),
  lessons: z.array(LessonSchema).min(1),
});

export const ConceptEdgeSchema = z.object({
  from: z.string(), to: z.string(), kind: z.enum(['prereq', 'encompasses']),
  weight: z.number().min(0).max(0.5).optional(), justification: z.string().optional(), confidence: z.number().min(0).max(1).optional(),
});

export const SourceDocSchema = z.object({
  id: z.string(), title: z.string(), kind: z.enum(['pdf', 'epub', 'docx', 'md', 'txt', 'syllabus']),
  hash: z.string(), licence: z.string().optional(), pageCount: z.number().optional(),
});

export const CurriculumManifestSchema = z.object({
  id: z.string(), version: z.number().int().min(1),
  parentVersion: z.object({ id: z.string(), version: z.number().int() }).optional(),
  title: z.string().min(1), subject: z.string().min(1), description: z.string(), level: z.string(),
  contentHash: z.string(),
  generator: z.object({ name: z.string(), version: z.string(), model: z.string().optional(), promptVersion: z.string().optional() }),
  createdAt: z.number(), licence: z.string().optional(),
});

export const CurriculumSchema = z.object({
  manifest: CurriculumManifestSchema,
  units: z.array(UnitSchema).min(1),
  edges: z.array(ConceptEdgeSchema),
  sources: z.array(SourceDocSchema),
});

export const ObserverResultSchema = z.object({
  attemptMade: z.boolean(),
  gaveUp: z.boolean(),
  offTopic: z.boolean(),
  objectiveProgress: z.array(z.object({ objectiveId: z.string(), status: z.enum(['none', 'partial', 'met']) })),
  misconceptionTags: z.array(z.string()),
  keyIdeaStated: z.boolean(),
  priorKnowledgeElicited: z.boolean(),
  stuck: z.boolean(),
  unsourcedClaims: z.array(z.string()),
});

export const GradeResultSchema = z.object({
  criteria: z.array(z.object({ id: z.string(), met: z.boolean(), evidence: z.string() })),
  score: z.number().min(0).max(1),
  misconceptionTags: z.array(z.string()),
  feedback: z.string(),
  confidence: z.number().min(0).max(1),
  samples: z.number().int().optional(),
});

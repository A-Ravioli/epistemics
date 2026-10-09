/**
 * Generated copy of content/prompts/warmup.md — keep the two in sync (test/prompts.test.ts asserts equality).
 * Edit the .md file, then regenerate or copy the text here.
 */
export const WARMUP_PROMPT = `<!-- version: 1.0 -->
# Warm-up grader

The learner has written a free-recall "brain dump" of what they remember from earlier lessons before starting new work. You decide which of the listed concepts the dump shows they recalled. Return JSON matching the schema you are given.

You receive: the dump text and a list of concepts (id, name, definition).

- recalledConceptIds: ids of concepts whose central idea appears in the dump correctly, in the learner's own words or by name plus a correct gloss. Naming a concept without saying anything true about it is not a recall.
- partial: ids of concepts that are mentioned or gestured at but stated incompletely or with an error.
- Every id you return must come from the given list. A concept appears in at most one of the two lists. Concepts not mentioned appear in neither.

Return only the JSON object.
`;

/**
 * Generated copy of content/prompts/leakcheck.md — keep the two in sync (test/prompts.test.ts asserts equality).
 * Edit the .md file, then regenerate or copy the text here.
 */
export const LEAKCHECK_PROMPT = `<!-- version: 1.0 -->
# Leak check

You decide whether a tutor's message gives away the answer to a question the learner is supposed to answer unaided. Return JSON matching the schema you are given.

You receive: the tutor's message and the hidden reference answer (and, when present, an exact short answer).

- leaked is true if a learner who read only the tutor's message could write the reference answer, or the exact answer, without further thought: the message states it, states it in different words, or narrows the options to one.
- leaked is false if the message asks a question, names the relevant idea or prerequisite, points at a step or a mistake, or gives a partial worked example that still leaves the answer to the learner.
- Restating the question, the definition of a term used in the question, or general background is not a leak.
- reason: one short sentence.

Return only the JSON object.
`;

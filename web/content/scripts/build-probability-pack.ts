/**
 * Assembles content/packs/probability-basics.epistemics.json from the typed concept specs in
 * content/scripts/probability/*.ts. Hashes are left empty here; run hash-pack.ts afterwards.
 *
 *   node --experimental-strip-types content/scripts/build-probability-pack.ts
 *   node --experimental-strip-types content/scripts/hash-pack.ts content/packs/probability-basics.epistemics.json
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConceptEdge, Curriculum, Lesson, Unit } from '@epistemics/core';
import { concept, type ConceptSpec } from './probability/helpers.ts';
import * as u1a from './probability/unit1a.ts';
import * as u1b from './probability/unit1b.ts';
import * as u2a from './probability/unit2a.ts';
import * as u2b from './probability/unit2b.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../packs/probability-basics.epistemics.json');

// Teaching order. Concept ordinals are global (1..N) so the order is unambiguous across lessons.
let ordinal = 0;
function lesson(id: string, n: number, title: string, summary: string, specs: ConceptSpec[]): Lesson {
  return { id, ordinal: n, title, summary, concepts: specs.map((s) => concept(++ordinal, s)) };
}

const units: Unit[] = [
  {
    id: 'u-events-counting-rules',
    ordinal: 1,
    title: 'Events, counting, and probability rules',
    summary:
      'Sample spaces and events, probability from equally likely outcomes, the complement rule; counting with the multiplication principle, permutations and combinations; the axioms, the addition rule and conditional probability; independence, the law of total probability and Bayes’ theorem with base-rate reasoning.',
    lessons: [
      lesson('l-sample-spaces-and-complement', 1, 'Sample spaces, events, and the complement', 'What a probability is a probability of: outcomes, events, equally likely counting and the complement trick for "at least one".', [
        u1a.sampleSpacesEvents,
        u1a.equallyLikelyOutcomes,
        u1a.complementRule,
      ]),
      lesson('l-counting', 2, 'Counting', 'The multiplication principle, permutations and combinations, and how counting turns into probability.', [
        u1a.multiplicationPrinciple,
        u1a.permutations,
        u1a.combinations,
        u1a.countingProbability,
      ]),
      lesson('l-axioms-addition-conditional', 3, 'Axioms, the addition rule, and conditional probability', 'The three axioms and what follows from them; adding probabilities without double counting; conditioning as shrinking the sample space; the multiplication rule for sequences.', [
        u1b.probabilityAxioms,
        u1b.additionRule,
        u1b.conditionalProbability,
        u1b.multiplicationRule,
      ]),
      lesson('l-independence-total-probability-bayes', 4, 'Independence, total probability, and Bayes', 'Independence (and why it is not disjointness), reasoning by cases, reversing a conditional with Bayes’ theorem, and why base rates dominate rare-event tests.', [
        u1b.independence,
        u1b.lawOfTotalProbability,
        u1b.bayesTheorem,
        u1b.baseRateReasoning,
      ]),
    ],
  },
  {
    id: 'u-random-variables-expectation',
    ordinal: 2,
    title: 'Random variables and expectation',
    summary:
      'Random variables and PMFs; expected value, linearity of expectation and variance; the Bernoulli, binomial and geometric distributions and memorylessness; joint and marginal distributions, independence of random variables and covariance; the sample mean, the law of large numbers and Monte Carlo simulation as a check.',
    lessons: [
      lesson('l-random-variables-and-expectation', 1, 'Random variables and expectation', 'Turning outcomes into numbers, averaging them with probability weights, adding expectations freely, and measuring spread.', [
        u2a.randomVariable,
        u2a.expectation,
        u2a.linearityOfExpectation,
        u2a.variance,
      ]),
      lesson('l-bernoulli-binomial-geometric', 2, 'Bernoulli, binomial, and geometric', 'One yes/no trial; counting successes in a fixed number of trials; waiting for the first success; and why nothing is ever "due".', [
        u2a.bernoulli,
        u2a.binomial,
        u2a.geometric,
        u2a.memorylessness,
      ]),
      lesson('l-joint-distributions-and-covariance', 3, 'Joint distributions and covariance', 'Two random variables at once: joint tables, marginals and conditionals, independence, and covariance and correlation.', [
        u2b.jointMarginal,
        u2b.independentRandomVariables,
        u2b.covariance,
      ]),
      lesson('l-long-run-behaviour-and-simulation', 4, 'Long-run behaviour and simulation', 'Why averages settle down: the variance of the sample mean, the law of large numbers, and Monte Carlo simulation as a check on theory.', [
        u2b.sampleMean,
        u2b.lawOfLargeNumbers,
        u2b.monteCarlo,
      ]),
    ],
  },
];

function prereq(from: string, to: string, justification: string, confidence = 0.9): ConceptEdge {
  return { from, to, kind: 'prereq', justification, confidence };
}
function encompasses(from: string, to: string, weight: number, justification: string): ConceptEdge {
  return { from, to, kind: 'encompasses', weight, justification, confidence: 0.8 };
}

// prereq: `to` requires `from`.
const edges: ConceptEdge[] = [
  // Unit 1, lesson 1
  prereq('c-sample-spaces-events', 'c-equally-likely-outcomes', 'The favourable/total ratio needs the sample space and the event as sets of outcomes.', 0.95),
  prereq('c-equally-likely-outcomes', 'c-complement-rule', 'Complement calculations are first practised on equally-likely probabilities such as (5/6)^4.', 0.85),
  // Lesson 2 (counting)
  prereq('c-multiplication-principle', 'c-permutations', 'P(n,r) is the multiplication principle with a shrinking number of options.', 0.95),
  prereq('c-permutations', 'c-combinations', 'C(n,r) is derived as P(n,r) divided by r!.', 0.95),
  prereq('c-combinations', 'c-counting-probability', 'Hand, sample and lottery probabilities are ratios of binomial coefficients.', 0.95),
  prereq('c-equally-likely-outcomes', 'c-counting-probability', 'Probability by counting is the equally-likely formula with counted numerators and denominators.', 0.95),
  prereq('c-complement-rule', 'c-counting-probability', 'The birthday-problem style argument counts the complement.', 0.7),
  // Lesson 3
  prereq('c-sample-spaces-events', 'c-probability-axioms', 'The axioms are statements about events as subsets of the sample space.', 0.9),
  prereq('c-complement-rule', 'c-probability-axioms', 'The complement rule is re-derived from the axioms; knowing it first motivates them.', 0.7),
  prereq('c-probability-axioms', 'c-addition-rule', 'The general addition rule is built from additivity for disjoint events.', 0.9),
  prereq('c-equally-likely-outcomes', 'c-conditional-probability', 'Conditioning is introduced as restricting an equally-likely sample space.', 0.85),
  prereq('c-probability-axioms', 'c-conditional-probability', 'P(A | B) = P(A ∩ B)/P(B) uses intersections and general probabilities, not only counts.', 0.8),
  prereq('c-conditional-probability', 'c-multiplication-rule', 'The multiplication rule is the definition of conditional probability rearranged.', 0.95),
  prereq('c-multiplication-principle', 'c-multiplication-rule', 'Tree diagrams and sequential draws generalise counting stage by stage to probabilities.', 0.6),
  // Lesson 4
  prereq('c-conditional-probability', 'c-independence', 'Independence is defined by P(A | B) = P(A).', 0.95),
  prereq('c-multiplication-rule', 'c-independence', 'Independence is the case where the multiplication rule reduces to P(A)P(B).', 0.85),
  prereq('c-addition-rule', 'c-independence', 'Contrasting independence with disjointness requires the disjoint addition rule.', 0.6),
  prereq('c-multiplication-rule', 'c-law-of-total-probability', 'Each case contributes P(B_i) P(A | B_i), a multiplication-rule product.', 0.95),
  prereq('c-addition-rule', 'c-law-of-total-probability', 'The case probabilities are added because the cases are disjoint.', 0.85),
  prereq('c-law-of-total-probability', 'c-bayes-theorem', 'The denominator of Bayes’ theorem is computed by total probability.', 0.95),
  prereq('c-conditional-probability', 'c-bayes-theorem', 'Bayes’ theorem is a statement about reversing a conditional probability.', 0.95),
  prereq('c-bayes-theorem', 'c-base-rate-reasoning', 'Positive predictive value is Bayes’ theorem applied to a screening test.', 0.95),
  // Unit 2, lesson 1
  prereq('c-sample-spaces-events', 'c-random-variable', 'A random variable is a function on the sample space; PMFs are built by grouping outcomes.', 0.9),
  prereq('c-probability-axioms', 'c-random-variable', 'A PMF is a probability assignment on the values, so it must be non-negative and sum to 1.', 0.8),
  prereq('c-random-variable', 'c-expectation', 'E[X] is computed from the PMF.', 0.95),
  prereq('c-expectation', 'c-linearity-of-expectation', 'Linearity is a property of expectation.', 0.95),
  prereq('c-expectation', 'c-variance', 'Variance is E[(X − μ)²] and uses E[X²] − μ².', 0.95),
  prereq('c-linearity-of-expectation', 'c-variance', 'The shortcut formula and Var(aX + b) rely on linearity of expectation.', 0.7),
  // Lesson 2
  prereq('c-random-variable', 'c-bernoulli', 'A Bernoulli variable is the simplest PMF.', 0.9),
  prereq('c-variance', 'c-bernoulli', 'The Bernoulli mean and variance are computed from the definitions.', 0.85),
  prereq('c-bernoulli', 'c-binomial', 'The binomial counts successes over independent Bernoulli trials.', 0.95),
  prereq('c-combinations', 'c-binomial', 'The binomial coefficient counts the sequences with k successes.', 0.95),
  prereq('c-independence', 'c-binomial', 'The probability of one sequence is a product because the trials are independent.', 0.85),
  prereq('c-bernoulli', 'c-geometric', 'The geometric waits for the first success in Bernoulli trials.', 0.95),
  prereq('c-independence', 'c-geometric', 'The probability of k − 1 failures then a success multiplies by independence.', 0.85),
  prereq('c-complement-rule', 'c-geometric', 'P(X > k) = (1 − p)^k is the complement of a success within k trials.', 0.6),
  prereq('c-geometric', 'c-memorylessness', 'Memorylessness is a property of the geometric distribution.', 0.95),
  prereq('c-conditional-probability', 'c-memorylessness', 'The property is stated and proved as a conditional probability.', 0.9),
  // Lesson 3
  prereq('c-random-variable', 'c-joint-marginal-distributions', 'A joint PMF extends the single-variable PMF to pairs.', 0.95),
  prereq('c-conditional-probability', 'c-joint-marginal-distributions', 'Conditional PMFs divide a cell by a marginal.', 0.85),
  prereq('c-joint-marginal-distributions', 'c-independent-random-variables', 'Independence of random variables is a factorisation of the joint PMF.', 0.95),
  prereq('c-independence', 'c-independent-random-variables', 'Independence of random variables generalises independence of events.', 0.9),
  prereq('c-variance', 'c-independent-random-variables', 'Adding variances of independent variables needs the definition of variance.', 0.85),
  prereq('c-independent-random-variables', 'c-covariance', 'Covariance is the cross term that vanishes under independence.', 0.9),
  prereq('c-variance', 'c-covariance', 'Correlation divides covariance by standard deviations; Var(X + Y) involves both.', 0.9),
  prereq('c-linearity-of-expectation', 'c-covariance', 'The shortcut Cov = E[XY] − E[X]E[Y] expands a product using linearity.', 0.8),
  // Lesson 4
  prereq('c-independent-random-variables', 'c-sample-mean', 'Var(sum) = nσ² requires independent observations.', 0.95),
  prereq('c-linearity-of-expectation', 'c-sample-mean', 'E[X̄] = μ follows from linearity.', 0.9),
  prereq('c-variance', 'c-sample-mean', 'Var(X̄) = σ²/n uses the a² scaling rule.', 0.9),
  prereq('c-sample-mean', 'c-law-of-large-numbers', 'The LLN is explained through Var(X̄) → 0.', 0.95),
  prereq('c-memorylessness', 'c-law-of-large-numbers', 'The gambler’s fallacy is contrasted with genuine long-run convergence.', 0.6),
  prereq('c-law-of-large-numbers', 'c-monte-carlo-simulation', 'Simulation estimates converge by the law of large numbers.', 0.95),
  prereq('c-bernoulli', 'c-monte-carlo-simulation', 'The standard error √(p(1 − p)/n) comes from the Bernoulli variance.', 0.8),

  // encompasses: practising `from` implicitly practises `to`.
  encompasses('c-bayes-theorem', 'c-conditional-probability', 0.4, 'Every Bayes calculation evaluates conditional probabilities.'),
  encompasses('c-bayes-theorem', 'c-law-of-total-probability', 0.4, 'The denominator of Bayes’ theorem is a total-probability calculation.'),
  encompasses('c-base-rate-reasoning', 'c-bayes-theorem', 0.5, 'Screening-test problems are Bayes’ theorem with medical labels.'),
  encompasses('c-binomial', 'c-combinations', 0.3, 'Evaluating a binomial PMF computes a binomial coefficient.'),
  encompasses('c-binomial', 'c-bernoulli', 0.3, 'The binomial mean and variance are n times the Bernoulli ones.'),
  encompasses('c-variance', 'c-expectation', 0.3, 'Computing a variance requires computing E[X] and E[X²].'),
  encompasses('c-counting-probability', 'c-combinations', 0.4, 'Counting probabilities evaluate binomial coefficients in numerator and denominator.'),
  encompasses('c-counting-probability', 'c-equally-likely-outcomes', 0.3, 'Probability by counting is the favourable/total ratio.'),
  encompasses('c-multiplication-rule', 'c-conditional-probability', 0.3, 'Each factor after the first is a conditional probability.'),
  encompasses('c-permutations', 'c-multiplication-principle', 0.4, 'A permutation count is a product of shrinking option counts.'),
  encompasses('c-covariance', 'c-expectation', 0.2, 'Cov = E[XY] − E[X]E[Y] computes expectations from a joint table.'),
  encompasses('c-sample-mean', 'c-variance', 0.3, 'Var(X̄) = σ²/n applies the scaling rule for variance.'),
  encompasses('c-memorylessness', 'c-geometric', 0.4, 'Memorylessness problems evaluate P(X > k) = (1 − p)^k.'),
  encompasses('c-law-of-large-numbers', 'c-sample-mean', 0.3, 'LLN reasoning uses the SD of the sample mean or proportion.'),
  encompasses('c-monte-carlo-simulation', 'c-law-of-large-numbers', 0.3, 'Judging Monte Carlo error applies the LLN and the √n law.'),
];

const pack: Curriculum = {
  manifest: {
    id: 'pack-probability-basics',
    version: 1,
    title: 'Probability: from counting to Bayes',
    subject: 'probability',
    description:
      'An introductory probability course for a motivated adult with high-school algebra: sample spaces, counting, the probability rules, conditional probability and Bayes, then random variables, expectation and variance, the named discrete distributions, joint distributions, the law of large numbers and simulation.',
    level: 'intro undergraduate',
    contentHash: '',
    generator: { name: 'hand-authored', version: '1.0' },
    createdAt: 1758000000000,
    licence: 'CC-BY-4.0',
  },
  units,
  edges,
  sources: [],
};

writeFileSync(OUT, JSON.stringify(pack, null, 2) + '\n');
const concepts = units.flatMap((u) => u.lessons.flatMap((l) => l.concepts));
console.log(`wrote ${OUT}: ${units.length} units, ${units.reduce((n, u) => n + u.lessons.length, 0)} lessons, ${concepts.length} concepts, ${concepts.reduce((n, c) => n + c.items.length, 0)} items, ${edges.length} edges (hashes empty; run hash-pack.ts)`);

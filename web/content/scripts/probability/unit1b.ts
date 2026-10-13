/** Unit 1, lessons 3-4: axioms, addition rule, conditional probability, multiplication rule; independence, total probability, Bayes, base rates. */
import { r, type ConceptSpec } from './helpers.ts';

export const probabilityAxioms: ConceptSpec = {
  id: 'c-probability-axioms',
  name: 'The probability axioms',
  definition: r`A probability assignment gives every event a number such that $P(A) \ge 0$, $P(S) = 1$, and $P(A \cup B) = P(A) + P(B)$ whenever $A$ and $B$ are disjoint. Everything else — the complement rule, $P(\emptyset) = 0$, $P(A) \le 1$, monotonicity — follows from these three.`,
  objectives: [
    ['remember', 'State the three axioms of probability.'],
    ['understand', r`Derive the complement rule, $P(\emptyset) = 0$ and $P(A) \le 1$ from the axioms.`],
    ['apply', 'Check whether a proposed assignment of probabilities is valid, and fill in a missing probability.'],
  ],
  misconceptions: [
    {
      tag: 'probabilities-need-not-sum-to-one',
      description: 'Accepts an assignment whose probabilities over disjoint, exhaustive cases do not add to 1 (e.g. "60% rain, 50% dry").',
      remedy: 'Ask what P(S) must be, and what additivity says about the sum over a set of disjoint events that cover S.',
    },
    {
      tag: 'additivity-always',
      description: 'Adds probabilities of two events regardless of whether they can occur together.',
      remedy: "Ask whether the events can both happen; if so, additivity's hypothesis (disjointness) fails.",
    },
  ],
  examples: [
    { title: 'Loaded die', body: r`P(6) = 0.25 and the other faces equally likely: $5p + 0.25 = 1$ gives $p = 0.15$ each.`, domain: 'games' },
    { title: 'Machine states', body: r`Each hour a machine is running, idle or down. If $P(R) = 0.7$ and $P(D) = 0.05$, then $P(I) = 0.25$ and $P(\text{not down}) = 0.95$.`, domain: 'manufacturing' },
    { title: 'Forecast categories', body: "A forecast of 'rain 55%, cloudy-dry 35%, sunny 20%' for mutually exclusive categories is invalid: the total is 110%.", domain: 'weather' },
  ],
  script: {
    pretest: {
      prompt: "A weather app says tomorrow will be 'rain 55%, cloudy but dry 35%, sunny 20%'. Exactly one of these will describe the day. Is this a valid probability assignment? Why or why not?",
      isomorph: 'A loaded die is claimed to have P(1) = 0.3, P(2) = 0.3, P(3) = 0.2, P(4) = 0.1, P(5) = 0.1, P(6) = 0.1. Is this a valid probability assignment?',
      reference: 'No. The three categories are disjoint and exhaustive, so their probabilities must add to P(S) = 1; they add to 1.10. (Isomorph: the six probabilities sum to 1.1, so it is invalid too.)',
    },
    guidingQuestions: [
      { question: 'What three rules must any assignment of probabilities obey?', expected: 'Probabilities are non-negative; the whole sample space has probability 1; the probability of a union of disjoint events is the sum of their probabilities.' },
      { question: 'The three weather categories cannot overlap and cover every possible day. What must their probabilities add up to?', expected: '1, because their union is S and additivity applies to disjoint events.', probesMisconception: 'probabilities-need-not-sum-to-one' },
      { question: r`Using only the axioms, can you show that $P(A^c) = 1 - P(A)$?`, expected: 'A and A^c are disjoint with union S, so P(A) + P(A^c) = P(S) = 1.' },
      { question: 'Why can no event have probability greater than 1?', expected: 'P(A) = 1 − P(A^c) and P(A^c) ≥ 0, so P(A) ≤ 1.' },
      { question: "If I told you P(rain) = 0.5 and P(windy) = 0.6, would that be invalid because 0.5 + 0.6 > 1?", expected: 'No: rain and windy can both happen, so additivity does not apply and nothing forces their sum to be at most 1.', probesMisconception: 'additivity-always' },
    ],
    workedExample: {
      problem: 'Each hour a machine is in exactly one of three states: running (R), idle (I) or down (D). Records show P(R) = 0.7 and P(D) = 0.05. Find P(I) and P(the machine is not down).',
      steps: [
        'The three states are disjoint and exhaustive, so P(R) + P(I) + P(D) = P(S) = 1.',
        'P(I) = 1 − 0.7 − 0.05 = 0.25.',
        "'Not down' is the complement of D: P = 1 − 0.05 = 0.95. Check: it is also R ∪ I, and 0.7 + 0.25 = 0.95.",
      ],
    },
    transfer: {
      prompt: 'A die is loaded so that P(6) = 0.25 and the other five faces are equally likely. Find P(1). Then find P(even).',
      reference: r`$5p + 0.25 = 1$ gives $p = 0.15$, so $P(1) = 0.15$. $P(\text{even}) = P(2) + P(4) + P(6) = 0.15 + 0.15 + 0.25 = 0.55$.`,
    },
    hints: [
      'Ask what happens to the total when you add up the probabilities of outcomes that cannot overlap and that cover everything.',
      'Axioms: P(S) = 1, and probabilities of disjoint events add. Are these categories disjoint and exhaustive?',
      'Rain, cloudy-dry and sunny are disjoint and together make up S, so P(rain) + P(cloudy) + P(sunny) must equal P(S). Add them and compare.',
    ],
  },
  teach: {
    keyIdea: 'probabilities are non-negative, the sample space has probability 1, and disjoint events add; everything else is a consequence.',
    answer: "Probability is a way of assigning numbers to events with just three rules. First, no probability is negative. Second, the whole sample space — 'something happens' — has probability 1. Third, if two events can't both happen (they're disjoint), the probability that one or the other happens is the sum. That's it; every other rule is derived. For instance, A and 'not A' are disjoint and together make S, so P(A) + P(not A) = 1. From that, P(A) ≤ 1. A practical use is checking claims: if a forecast says rain 55%, cloudy-dry 35%, sunny 20% for categories that can't overlap, the sum 110% shows it's inconsistent. But be careful — the third rule needs disjointness: P(rain) = 0.5 and P(windy) = 0.6 is perfectly fine because a day can be both.",
  },
  items: [
    { type: 'recall', prompt: 'State the three axioms of probability.', answer: r`(1) $P(A) \ge 0$ for every event $A$; (2) $P(S) = 1$; (3) if $A$ and $B$ are disjoint, $P(A \cup B) = P(A) + P(B)$ (extended to any countable collection of pairwise disjoint events).` },
    {
      type: 'apply',
      prompt: 'A spinner lands on red, blue, green or yellow. P(red) = 0.4, P(blue) = 0.25, and green is twice as likely as yellow. Find P(green) and P(yellow).',
      answer: r`The four outcomes are disjoint and exhaustive, so P(green) + P(yellow) = 1 − 0.4 − 0.25 = 0.35. With P(green) = 2 P(yellow): $3\,P(\text{yellow}) = 0.35$, so P(yellow) = 7/60 ≈ 0.117 and P(green) = 7/30 ≈ 0.233.`,
      exact: 'P(green) = 7/30 ≈ 0.233; P(yellow) = 7/60 ≈ 0.117',
      rubric: ['Uses the fact that the four probabilities sum to 1 to get 0.35 for green and yellow together.', 'Sets up green = 2 × yellow and solves.', 'Gives P(yellow) ≈ 0.117 and P(green) ≈ 0.233.'],
    },
    {
      type: 'explain',
      prompt: r`Using only the axioms, explain why $P(\emptyset) = 0$ and why $P(A) \le 1$ for every event $A$.`,
      answer: r`$S$ and $\emptyset$ are disjoint and $S \cup \emptyset = S$, so by additivity $P(S) + P(\emptyset) = P(S)$, giving $P(\emptyset) = 0$. For the second claim, $A$ and $A^c$ are disjoint with union $S$, so $P(A) + P(A^c) = P(S) = 1$. Since $P(A^c) \ge 0$ by the first axiom, $P(A) = 1 - P(A^c) \le 1$.`,
      rubric: [
        'Shows P(∅) = 0 by applying additivity to the disjoint pair S, ∅ (or an equivalent argument).',
        'Uses that A and A^c are disjoint with union S to get P(A) + P(A^c) = 1.',
        'Uses non-negativity of P(A^c) to conclude P(A) ≤ 1.',
      ],
    },
    {
      type: 'apply',
      bloom: 'analyze',
      prompt: 'Which of these are valid probability assignments for an experiment with four outcomes, and why? (a) 0.2, 0.3, 0.3, 0.2  (b) 0.5, 0.5, 0.1, −0.1  (c) 0.25, 0.25, 0.25, 0.3',
      answer: '(a) is valid: all non-negative and the sum is 1. (b) is invalid: −0.1 violates non-negativity (even though the sum is 1). (c) is invalid: all non-negative but the sum is 1.05, not 1.',
      exact: 'only (a)',
      rubric: ['Identifies (a) as valid.', 'Rejects (b) because of the negative probability.', 'Rejects (c) because the probabilities do not sum to 1.'],
    },
    { type: 'cloze', prompt: r`If $A$ and $B$ are disjoint then $P(A \cup B) = $ ____; if $A \subseteq B$ then $P(A)$ ____ $P(B)$.`, answer: 'P(A) + P(B); ≤ (is at most)' },
  ],
};

export const additionRule: ConceptSpec = {
  id: 'c-addition-rule',
  name: 'The addition rule',
  definition: r`For any two events, $P(A \cup B) = P(A) + P(B) - P(A \cap B)$: the overlap was counted twice and is subtracted once. When $A$ and $B$ are disjoint the overlap is 0 and the rule reduces to $P(A) + P(B)$.`,
  objectives: [
    ['understand', 'Explain the double-counting of the overlap with a Venn diagram.'],
    ['apply', r`Compute $P(A \text{ or } B)$ from $P(A)$, $P(B)$ and $P(A \cap B)$, and the probability of 'neither'.`],
    ['analyze', "Decide whether events are disjoint and distinguish 'at least one' from 'exactly one'."],
  ],
  misconceptions: [
    {
      tag: 'or-means-add',
      description: 'Adds P(A) and P(B) for overlapping events.',
      remedy: "Use a die: P(even or > 3) counted directly is 4/6, but 3/6 + 3/6 = 1. Ask which outcomes were counted twice.",
    },
    {
      tag: 'or-is-exclusive',
      description: "Reads 'A or B' as 'exactly one of A, B' (exclusive or).",
      remedy: "Clarify that 'or' in probability is inclusive; P(exactly one) = P(A) + P(B) − 2 P(A ∩ B) is a different quantity.",
    },
  ],
  examples: [
    { title: 'Even or greater than 3', body: r`On a fair die: $P(\text{even}) + P(>3) - P(\text{even and} > 3) = 3/6 + 3/6 - 2/6 = 2/3$; directly, $\{2, 4, 5, 6\}$ has 4 of 6 outcomes.`, domain: 'games' },
    { title: 'Two conditions', body: '40% of patients have high blood pressure, 25% have diabetes, 10% have both: 40 + 25 − 10 = 55% have at least one.', domain: 'medicine' },
    { title: 'Two defect types', body: '6% of parts have a scratch, 3% a dent, 1% both: 8% have some defect, so 92% have neither.', domain: 'manufacturing' },
  ],
  script: {
    pretest: {
      prompt: 'In a clinic, 40% of patients have high blood pressure, 25% have diabetes, and 10% have both. What percentage have at least one of the two conditions?',
      isomorph: 'A card is drawn from a standard deck. What is the probability that it is a heart or a king?',
      reference: r`$40 + 25 - 10 = 55\%$. (Isomorph: $13/52 + 4/52 - 1/52 = 16/52 = 4/13$.)`,
    },
    guidingQuestions: [
      { question: 'If we simply add 40% and 25%, which patients get counted twice?', expected: 'The 10% who have both conditions: they are inside both groups.', probesMisconception: 'or-means-add' },
      { question: 'So how do we fix the double count?', expected: 'Subtract the overlap once: 40 + 25 − 10 = 55%.' },
      { question: 'When could you add the two probabilities without subtracting anything?', expected: 'When the events are disjoint (cannot both occur), so the overlap has probability 0.' },
      { question: "What is the probability that a patient has exactly one of the two conditions? Is that what 'at least one' means?", expected: '55% − 10% = 45%. No: at least one includes those with both.', probesMisconception: 'or-is-exclusive' },
    ],
    workedExample: {
      problem: 'A fair die is rolled. What is the probability that the result is even or greater than 3?',
      steps: [
        'A = even = {2, 4, 6}, B = greater than 3 = {4, 5, 6}, overlap A ∩ B = {4, 6}.',
        r`$P(A \cup B) = P(A) + P(B) - P(A \cap B) = 3/6 + 3/6 - 2/6 = 4/6 = 2/3$.`,
        'Check directly: A ∪ B = {2, 4, 5, 6}, four of six outcomes.',
      ],
    },
    transfer: {
      prompt: 'On a production line 6% of parts have a scratch, 3% have a dent, and 1% have both. What fraction of parts have no defect of either kind?',
      reference: r`$P(\text{scratch or dent}) = 0.06 + 0.03 - 0.01 = 0.08$, so $P(\text{neither}) = 1 - 0.08 = 0.92$.`,
    },
    hints: [
      'Draw two overlapping circles for the two conditions and think about where the 10% sits.',
      'Add the two percentages, then correct for whatever was counted twice.',
      "40% + 25% = 65% counts the 10% with both conditions twice. Subtract the overlap once to get P(at least one).",
    ],
  },
  teach: {
    keyIdea: 'P(A or B) = P(A) + P(B) − P(A and B); the overlap is subtracted because adding counts it twice, and the subtraction vanishes for disjoint events.',
    answer: "The addition rule tells you the probability that at least one of two events happens. Adding P(A) and P(B) is almost right, but anything in both events gets counted twice, so you subtract the overlap once: P(A or B) = P(A) + P(B) − P(A and B). Clinic example: 40% have high blood pressure, 25% have diabetes, 10% have both. 40 + 25 = 65 counts the 10% twice, so 55% have at least one condition — and 45% have neither. If the events can't both happen, the overlap is zero and you just add — that's the disjoint case, which is actually one of the axioms. Two cautions: 'or' here is inclusive (having both counts), and if you want 'exactly one' you subtract the overlap twice: 40 + 25 − 20 = 45%.",
  },
  items: [
    { type: 'recall', prompt: 'State the general addition rule and its special case for disjoint events.', answer: r`$P(A \cup B) = P(A) + P(B) - P(A \cap B)$. If $A$ and $B$ are disjoint then $P(A \cap B) = 0$ and $P(A \cup B) = P(A) + P(B)$.` },
    {
      type: 'apply',
      prompt: 'A card is drawn from a standard 52-card deck. What is the probability that it is a spade or a face card (J, Q, K)?',
      answer: r`$P(\text{spade}) = 13/52$, $P(\text{face}) = 12/52$, $P(\text{spade face card}) = 3/52$. $P = 13/52 + 12/52 - 3/52 = 22/52 = 11/26 \approx 0.42$.`,
      exact: '11/26',
      rubric: ['Uses 13/52 and 12/52 for the two events.', 'Subtracts the overlap 3/52 (the three spade face cards).', 'Gives 22/52 = 11/26.'],
    },
    {
      type: 'apply',
      prompt: 'In a town, 30% of households have a dog, 20% have a cat, and 8% have both. What percentage have a dog or a cat? What percentage have neither?',
      answer: '30 + 20 − 8 = 42% have a dog or a cat; 100 − 42 = 58% have neither.',
      exact: '42%; 58%',
      rubric: ['Applies P(A ∪ B) = 30 + 20 − 8.', 'Gives 42% for dog or cat.', 'Gives 58% for neither via the complement.'],
    },
    {
      type: 'explain',
      prompt: r`Explain why $P(A \cup B) = P(A) + P(B)$ is wrong for overlapping events and how the general addition rule fixes it. Use a die example to illustrate.`,
      answer: r`Adding $P(A)$ and $P(B)$ counts every outcome in $A \cap B$ twice — once as part of $A$ and once as part of $B$. Subtracting $P(A \cap B)$ once removes the duplicate, giving $P(A \cup B) = P(A) + P(B) - P(A \cap B)$. Die example: A = even = {2,4,6}, B = greater than 3 = {4,5,6}; adding gives 3/6 + 3/6 = 1, but the union {2,4,5,6} has probability 4/6; subtracting the overlap {4,6} (2/6) gives 4/6, which is correct. For disjoint events the overlap is empty, so the plain sum is right.`,
      rubric: [
        'Identifies that outcomes in A ∩ B are counted twice by the plain sum.',
        'States the corrected formula P(A) + P(B) − P(A ∩ B).',
        'Gives a correct concrete die (or similar) example with numbers.',
        'Notes that for disjoint events the overlap term is 0.',
      ],
      tags: ['or-means-add'],
    },
    {
      type: 'discriminate',
      prompt: r`How does $P(A \text{ or } B)$ differ from $P(\text{exactly one of } A, B)$? Give a formula for each in terms of $P(A)$, $P(B)$ and $P(A \cap B)$, and compute both for $P(A) = 0.5$, $P(B) = 0.4$, $P(A \cap B) = 0.2$.`,
      answer: r`'A or B' is inclusive — at least one occurs, including both: $P(A \cup B) = P(A) + P(B) - P(A \cap B) = 0.5 + 0.4 - 0.2 = 0.7$. 'Exactly one' excludes the overlap entirely: $P(A) + P(B) - 2P(A \cap B) = 0.5 + 0.4 - 0.4 = 0.5$. The difference between them, 0.2, is the probability that both occur.`,
      rubric: [
        'Gives P(A ∪ B) = P(A) + P(B) − P(A ∩ B).',
        'Gives P(exactly one) = P(A) + P(B) − 2 P(A ∩ B).',
        'Computes 0.7 and 0.5.',
      ],
      tags: ['or-is-exclusive'],
    },
  ],
};

export const conditionalProbability: ConceptSpec = {
  id: 'c-conditional-probability',
  name: 'Conditional probability',
  definition: r`The conditional probability of $A$ given $B$ is $P(A \mid B) = \dfrac{P(A \cap B)}{P(B)}$ (for $P(B) > 0$): the probability of $A$ once we know $B$ occurred, computed by shrinking the sample space to $B$.`,
  objectives: [
    ['understand', 'Explain conditioning as restricting the sample space to the outcomes consistent with the given information.'],
    ['apply', r`Compute $P(A \mid B)$ from a two-way table of counts or from joint probabilities.`],
    ['analyze', r`Distinguish $P(A \mid B)$ from $P(B \mid A)$ and from $P(A \cap B)$.`],
  ],
  misconceptions: [
    {
      tag: 'confuses-direction-of-conditioning',
      description: 'Treats P(A | B) and P(B | A) as the same number (the inverse fallacy).',
      remedy: 'Use a table of counts: compute both from the same cell with different row/column totals as denominators.',
    },
    {
      tag: 'conditional-as-joint',
      description: 'Reports P(A ∩ B) when asked for P(A | B), forgetting to divide by P(B).',
      remedy: "'Given B' means the denominator is P(B), not 1: only outcomes in B remain possible.",
    },
  ],
  examples: [
    { title: 'Six given even', body: r`Knowing a die roll is even shrinks the sample space to {2, 4, 6}, so $P(6 \mid \text{even}) = 1/3$, whereas $P(\text{even} \mid 6) = 1$.`, domain: 'games' },
    { title: 'Supplier of a defective part', body: r`200 parts: 120 from supplier X (6 defective), 80 from Y (8 defective). $P(Y \mid \text{defective}) = 8/14 \approx 0.57$, but $P(\text{defective} \mid Y) = 8/80 = 0.1$.`, domain: 'manufacturing' },
    { title: 'Cough and smoking', body: r`Of 300 smokers 60 have a cough; of 700 non-smokers 35 do. $P(\text{cough} \mid \text{smoker}) = 0.2$ and $P(\text{smoker} \mid \text{cough}) = 60/95 \approx 0.63$.`, domain: 'medicine' },
  ],
  script: {
    pretest: {
      prompt: 'A fair die is rolled and you are told that the result is even. What is the probability that it is a 6?',
      isomorph: 'A card drawn from a standard deck is known to be a face card (J, Q or K). What is the probability that it is a king?',
      reference: r`$P(6 \mid \text{even}) = (1/6)/(3/6) = 1/3$: within the reduced sample space {2, 4, 6}, one outcome is a 6. (Isomorph: $4/12 = 1/3$.)`,
    },
    guidingQuestions: [
      { question: 'Once you know the roll is even, which outcomes are still possible?', expected: '{2, 4, 6}: the information rules out 1, 3 and 5.' },
      { question: 'Within that reduced set, how likely is a 6?', expected: '1/3, since the three remaining outcomes are still equally likely.' },
      { question: r`Write the same thing with the formula: what are $P(6 \cap \text{even})$ and $P(\text{even})$?`, expected: 'P(6 ∩ even) = P(6) = 1/6 and P(even) = 3/6, so the ratio is 1/3 — not 1/6, which is the joint probability.', probesMisconception: 'conditional-as-joint' },
      { question: r`Now compute $P(\text{even} \mid 6)$. Is it the same number as $P(6 \mid \text{even})$?`, expected: 'P(even | 6) = 1, since a 6 is certainly even. The two conditionals differ because the conditioning events differ.', probesMisconception: 'confuses-direction-of-conditioning' },
    ],
    workedExample: {
      problem: 'A batch of 200 parts: 120 from supplier X, of which 6 are defective, and 80 from supplier Y, of which 8 are defective. A part chosen at random turns out to be defective. What is the probability it came from Y? Separately, what is P(defective | Y)?',
      steps: [
        'Make the two-way table: X: 6 defective, 114 good; Y: 8 defective, 72 good. Total defective = 14.',
        r`Given 'defective', the sample space shrinks to those 14 parts; 8 are from Y: $P(Y \mid D) = 8/14 = 4/7 \approx 0.57$.`,
        r`Given 'Y', the sample space is the 80 Y-parts; 8 are defective: $P(D \mid Y) = 8/80 = 0.10$.`,
        'The two conditionals share the numerator (8 parts) but have different denominators, so they are different numbers.',
      ],
    },
    transfer: {
      prompt: 'In a study of 1000 people, 300 smoke. 60 of the smokers and 35 of the non-smokers developed a persistent cough. Find P(cough | smoker) and P(smoker | cough).',
      reference: r`$P(\text{cough} \mid \text{smoker}) = 60/300 = 0.20$; $P(\text{smoker} \mid \text{cough}) = 60/(60 + 35) = 60/95 \approx 0.63$.`,
    },
    hints: [
      "The information 'even' rules some outcomes out. Which ones are left?",
      'Restrict the sample space to the outcomes consistent with the given information, then count within it.',
      'Given even, the sample space shrinks to {2, 4, 6}, all still equally likely. One of them is a 6. Write P(6 | even) as (outcomes that are 6 and even) ÷ (outcomes that are even).',
    ],
  },
  teach: {
    keyIdea: 'P(A | B) = P(A and B) / P(B): conditioning on B shrinks the sample space to B, and the direction of conditioning matters.',
    answer: "Conditional probability is what happens to a probability when you learn something. Roll a die: P(6) = 1/6. Now I tell you the roll was even. The only possibilities left are 2, 4, 6, so P(6 given even) = 1/3. The formula P(A | B) = P(A and B)/P(B) says exactly that: keep only the part of A that lies inside B, and rescale so that B itself has probability 1. Two things trip people up. First, don't stop at the joint probability: P(6 and even) = 1/6 is not the answer; you must divide by P(even) = 1/2. Second, direction matters: P(even | 6) = 1, which is very different from P(6 | even) = 1/3. In medicine this is the difference between 'the test is positive in 95% of sick people' and '95% of positive tests are sick people' — the same cell of a table divided by different totals.",
  },
  items: [
    { type: 'recall', prompt: r`Define $P(A \mid B)$ by formula and describe it in words as a restriction of the sample space.`, answer: r`$P(A \mid B) = P(A \cap B)/P(B)$ for $P(B) > 0$. It is the probability of $A$ when the sample space is shrunk to the outcomes in $B$ and probabilities are rescaled so that $B$ has total probability 1.` },
    {
      type: 'apply',
      prompt: 'Two fair dice are rolled. Given that the sum is 8, what is the probability that at least one die shows a 6?',
      answer: 'Outcomes with sum 8: (2,6), (3,5), (4,4), (5,3), (6,2) — five equally likely outcomes. Those with a 6: (2,6) and (6,2). So P = 2/5.',
      exact: '2/5',
      rubric: ['Restricts to the 5 outcomes with sum 8.', 'Identifies the 2 of them containing a 6.', 'Gives 2/5.'],
    },
    {
      type: 'apply',
      prompt: 'In a factory 70% of parts come from line A and 30% from line B. 2% of line-A parts and 5% of line-B parts are defective. What is the probability that a randomly chosen part is from line A and defective? What is P(defective | line A)? Explain in one sentence how these two numbers differ in meaning.',
      answer: r`Joint: $P(A \cap D) = P(A)\,P(D \mid A) = 0.7 \times 0.02 = 0.014$. Conditional: $P(D \mid A) = 0.02$ (given directly). The joint probability is the fraction of all parts that are both from A and defective; the conditional is the fraction of A's parts that are defective.`,
      exact: '0.014; 0.02',
      rubric: ['Computes the joint probability 0.7 × 0.02 = 0.014.', 'States P(defective | A) = 0.02.', 'Distinguishes the joint (fraction of all parts) from the conditional (fraction of A-parts) in words.'],
      tags: ['conditional-as-joint'],
    },
    {
      type: 'explain',
      prompt: r`Explain why $P(A \mid B)$ and $P(B \mid A)$ are generally different, using a two-way table of counts as your example.`,
      answer: r`Both conditionals have the same numerator, $P(A \cap B)$, but different denominators: $P(A \mid B) = P(A \cap B)/P(B)$ divides by the size of $B$, while $P(B \mid A) = P(A \cap B)/P(A)$ divides by the size of $A$. Example: 200 parts, 80 from supplier Y, 14 defective in total, 8 of them from Y. $P(Y \mid D) = 8/14 \approx 0.57$ but $P(D \mid Y) = 8/80 = 0.10$. They coincide only when $P(A) = P(B)$.`,
      rubric: [
        'States that both conditionals share the numerator P(A ∩ B).',
        'States that the denominators differ (P(B) versus P(A)).',
        'Gives a concrete table/example in which the two values differ.',
        'Notes the equality holds only when P(A) = P(B).',
      ],
      tags: ['confuses-direction-of-conditioning'],
    },
    {
      type: 'discriminate',
      prompt: "A test for a disease has P(positive | disease) = 0.95. A patient tests positive and says, 'so there is a 95% chance I have it.' Using conditional-probability notation, explain what has been confused and what further information would be needed to answer the patient's question.",
      answer: r`The patient wants $P(\text{disease} \mid \text{positive})$ but has quoted $P(\text{positive} \mid \text{disease})$. These have the same numerator $P(\text{disease} \cap \text{positive})$ but different denominators: the fraction of sick people who test positive versus the fraction of positive testers who are sick. To compute the one the patient wants, you also need the prevalence $P(\text{disease})$ and the false-positive rate $P(\text{positive} \mid \text{no disease})$, so that $P(\text{positive})$ can be found.`,
      rubric: [
        'Identifies the confusion of P(positive | disease) with P(disease | positive).',
        'Explains that the two have different conditioning events / denominators.',
        'Names the prevalence (base rate) and the false-positive rate as the missing information.',
      ],
      tags: ['confuses-direction-of-conditioning', 'base-rate-neglect'],
    },
  ],
};

export const multiplicationRule: ConceptSpec = {
  id: 'c-multiplication-rule',
  name: 'The multiplication rule and chain rule',
  definition: r`Rearranging the definition of conditional probability gives $P(A \cap B) = P(A)\,P(B \mid A)$, and for a sequence $P(A_1 \cap A_2 \cap A_3) = P(A_1)\,P(A_2 \mid A_1)\,P(A_3 \mid A_1 \cap A_2)$. It is the rule behind tree diagrams and sampling without replacement.`,
  objectives: [
    ['understand', 'Explain why a joint probability is the product of a marginal probability and a conditional probability.'],
    ['apply', 'Compute probabilities of sequences of draws without replacement using a tree or the chain rule.'],
    ['analyze', 'Identify when the conditional probabilities change with earlier outcomes (without replacement) versus stay the same (with replacement).'],
  ],
  misconceptions: [
    {
      tag: 'ignores-changing-denominator',
      description: 'Uses the same probability for the second draw as for the first when drawing without replacement.',
      remedy: 'Ask how many cards remain after the first draw, and how many of them are aces.',
    },
    {
      tag: 'multiplies-unconditional',
      description: 'Multiplies P(A) by P(B) for events that are not independent.',
      remedy: "Ask: 'given the first card was an ace, what is the chance the second is?' — the second factor must be conditional.",
    },
  ],
  examples: [
    { title: 'Two aces', body: r`Without replacement: $P(\text{ace, ace}) = \frac{4}{52} \cdot \frac{3}{51} = \frac{1}{221}$. With replacement it would be $(4/52)^2 = 1/169$.`, domain: 'games' },
    { title: 'Three defective in a row', body: r`Lot of 10 with 3 defective, three drawn: $P(\text{all defective}) = \frac{3}{10} \cdot \frac{2}{9} \cdot \frac{1}{8} = \frac{1}{120}$.`, domain: 'manufacturing' },
    { title: 'Two-stage screening', body: r`8% have the condition; stage 1 flags 90% of them; stage 2 confirms 95% of flagged true cases: $0.08 \times 0.9 \times 0.95 = 0.0684$ of all patients are confirmed true cases.`, domain: 'medicine' },
  ],
  script: {
    pretest: {
      prompt: 'Two cards are drawn without replacement from a standard 52-card deck. What is the probability that both are aces?',
      isomorph: 'A box has 5 red and 3 blue balls; two are drawn without replacement. What is the probability that both are blue?',
      reference: r`$\frac{4}{52} \times \frac{3}{51} = \frac{12}{2652} = \frac{1}{221} \approx 0.0045$. (Isomorph: $\frac{3}{8} \times \frac{2}{7} = \frac{3}{28}$.)`,
    },
    guidingQuestions: [
      { question: 'What is the probability that the first card is an ace?', expected: '4/52 = 1/13.' },
      { question: 'Suppose it was an ace. How many cards are left, and how many of them are aces?', expected: '51 cards, 3 aces, so P(second ace | first ace) = 3/51.', probesMisconception: 'ignores-changing-denominator' },
      { question: 'How do we combine those two numbers, and why is multiplying the right thing to do?', expected: 'Multiply: P(A1 ∩ A2) = P(A1) P(A2 | A1). Of the 4/52 of the time the first is an ace, a fraction 3/51 of those times the second is too — a fraction of a fraction.' },
      { question: 'Why would 4/52 × 4/52 be wrong here, and when would it be right?', expected: 'It uses the unconditional probability for the second draw; that is right only if the first card is replaced (draws independent).', probesMisconception: 'multiplies-unconditional' },
    ],
    workedExample: {
      problem: 'A lot of 10 parts has 3 defective. Three parts are drawn at random without replacement. Find P(all three defective) and P(first two good, third defective).',
      steps: [
        r`All defective: $\frac{3}{10} \times \frac{2}{9} \times \frac{1}{8} = \frac{6}{720} = \frac{1}{120}$.`,
        r`Good, good, defective: $\frac{7}{10} \times \frac{6}{9} \times \frac{3}{8} = \frac{126}{720} = \frac{7}{40}$.`,
        'Each factor after the first is conditional on what was already drawn: the denominator falls by one each time, and the numerator tracks how many of the required type remain.',
      ],
    },
    transfer: {
      prompt: 'A two-stage screening programme: 8% of patients have the condition. Stage 1 flags 90% of those who have it. Flagged patients go to stage 2, which confirms 95% of true cases. What fraction of all patients are confirmed true cases (have it, are flagged, and are confirmed)?',
      reference: r`$0.08 \times 0.90 \times 0.95 = 0.0684$, i.e. about 6.8% of all patients.`,
    },
    hints: [
      'Think of drawing the cards one at a time. What changes about the deck after the first draw?',
      'Multiply the probability of the first event by the probability of the second event given that the first happened.',
      'P(first ace) = 4/52. Given that, 51 cards remain with 3 aces, so P(second ace | first ace) = 3/51. Multiply the two fractions and simplify.',
    ],
  },
  teach: {
    keyIdea: 'P(A and B) = P(A) × P(B | A): the second factor is conditional on the first event, which is what changes when sampling without replacement.',
    answer: "The multiplication rule is the conditional-probability formula turned around: P(A and B) = P(A) × P(B given A). It's how you follow a tree diagram — multiply along the branches. Draw two cards without replacement: P(first is an ace) = 4/52, and if that happened, 51 cards remain with 3 aces, so P(second is an ace | first was) = 3/51. Multiply: 4/52 × 3/51 = 1/221. The key habit is to ask, at each step, 'what's the situation now, given everything that's happened so far?' The common mistake is to reuse 4/52 for the second card; that would only be right if you put the first card back. For longer sequences the rule chains: P(A1 and A2 and A3) = P(A1) P(A2 | A1) P(A3 | A1 and A2).",
  },
  items: [
    { type: 'recall', prompt: r`State the multiplication rule for $P(A \cap B)$ and its extension to three events.`, answer: r`$P(A \cap B) = P(A)\,P(B \mid A)$ (equivalently $P(B)\,P(A \mid B)$). For three events, $P(A \cap B \cap C) = P(A)\,P(B \mid A)\,P(C \mid A \cap B)$.` },
    {
      type: 'apply',
      prompt: 'A drawer has 6 black socks and 4 white socks. Two socks are taken at random without replacement. What is the probability that both are white?',
      answer: r`$\frac{4}{10} \times \frac{3}{9} = \frac{12}{90} = \frac{2}{15} \approx 0.133$.`,
      exact: '2/15',
      rubric: ['Uses 4/10 for the first sock.', 'Uses the conditional 3/9 for the second sock.', 'Gives 2/15.'],
    },
    {
      type: 'apply',
      prompt: 'A batch of 12 vaccine vials contains 2 that are out of specification. A nurse picks 3 vials at random without replacement. What is the probability that none of them is out of specification?',
      answer: r`$\frac{10}{12} \times \frac{9}{11} \times \frac{8}{10} = \frac{720}{1320} = \frac{6}{11} \approx 0.545$. (Equivalently $\binom{10}{3}/\binom{12}{3} = 120/220$.)`,
      exact: '6/11',
      rubric: ['Sets up three factors with denominators 12, 11, 10.', 'Uses numerators 10, 9, 8 for the in-spec vials.', 'Gives 6/11 ≈ 0.545.'],
    },
    {
      type: 'explain',
      prompt: r`Explain why the probability of drawing two aces without replacement is $\frac{4}{52} \cdot \frac{3}{51}$ rather than $\frac{4}{52} \cdot \frac{4}{52}$, and say what the second factor represents.`,
      answer: r`The second factor is the conditional probability $P(\text{second ace} \mid \text{first ace})$. Once an ace has been removed, the deck holds 51 cards of which 3 are aces, so that conditional probability is $3/51$, not $4/52$. Using $4/52$ twice would describe drawing with replacement (independent draws). The multiplication rule $P(A_1 \cap A_2) = P(A_1)P(A_2 \mid A_1)$ gives $\frac{4}{52} \cdot \frac{3}{51} = \frac{1}{221}$.`,
      rubric: [
        'Identifies the second factor as the conditional probability P(second ace | first ace).',
        'Explains that 51 cards with 3 aces remain after an ace is removed.',
        'States that 4/52 · 4/52 corresponds to drawing with replacement / independent draws.',
        'Gives the result 1/221.',
      ],
      tags: ['ignores-changing-denominator'],
    },
    {
      type: 'predict',
      prompt: 'Before calculating: from a lot of 10 parts with 3 defective, two parts are drawn. Is P(both defective) larger with replacement or without? Then compute both.',
      answer: r`Without replacement is smaller: removing a defective leaves proportionally fewer. With replacement: $0.3 \times 0.3 = 0.09$. Without: $\frac{3}{10} \times \frac{2}{9} = \frac{6}{90} \approx 0.067$.`,
    },
  ],
};

export const independence: ConceptSpec = {
  id: 'c-independence',
  name: 'Independence',
  definition: r`Events $A$ and $B$ are independent when knowing one occurred does not change the probability of the other: $P(A \mid B) = P(A)$, equivalently $P(A \cap B) = P(A)\,P(B)$. Independence is a property of the probabilities, not of whether the events can happen together.`,
  objectives: [
    ['understand', 'State the two equivalent definitions of independence and explain why they are equivalent.'],
    ['apply', 'Test independence from a table or from listed outcomes, and use it to compute joint probabilities.'],
    ['analyze', 'Distinguish independent events from disjoint (mutually exclusive) events.'],
  ],
  misconceptions: [
    {
      tag: 'independent-vs-disjoint',
      description: "Believes disjoint events are independent ('they can't both happen, so one doesn't affect the other').",
      remedy: 'Show that for disjoint events with positive probability, knowing A occurred makes B impossible: P(B | A) = 0 ≠ P(B). That is maximal dependence.',
    },
    {
      tag: 'independence-judged-causally',
      description: 'Decides independence by whether the events feel causally related instead of checking the probabilities.',
      remedy: "Check the numbers: on a die, 'even' and 'at most 4' are independent even though they seem related.",
    },
  ],
  examples: [
    { title: 'Even and at most 4', body: r`Fair die: $P(\text{even}) = 1/2$, $P(\le 4) = 2/3$, $P(\text{even and} \le 4) = P(\{2,4\}) = 1/3 = \tfrac12 \cdot \tfrac23$. Independent, despite appearances.`, domain: 'games' },
    { title: 'Smoking and coffee', body: r`200 adults: 80 smokers, of whom 50 drink coffee daily; 120 non-smokers, of whom 75 do. $P(C \mid S) = 50/80 = 0.625 = P(C) = 125/200$, so the two are independent in this sample.`, domain: 'medicine' },
    { title: 'Two machines', body: r`Machines fail independently on a given day with probabilities 0.1 and 0.05: $P(\text{both fail}) = 0.005$, $P(\text{at least one}) = 1 - 0.9 \times 0.95 = 0.145$.`, domain: 'manufacturing' },
  ],
  script: {
    pretest: {
      prompt: "A fair die is rolled. Let A = 'even' and B = 'result at most 4'. Are A and B independent? Show why.",
      isomorph: "A fair die is rolled. Let A = 'even' and B = 'result at most 3'. Are A and B independent?",
      reference: r`$P(A) = 1/2$, $P(B) = 2/3$, $P(A \cap B) = P(\{2,4\}) = 1/3 = \tfrac12 \times \tfrac23$, so yes, independent. (Isomorph: $P(B) = 1/2$, $P(A \cap B) = P(\{2\}) = 1/6 \ne 1/4$, so not independent.)`,
    },
    guidingQuestions: [
      { question: 'In words, what does it mean for B to be independent of A?', expected: 'Learning that A happened does not change the probability of B: P(B | A) = P(B).' },
      { question: r`Compute $P(A)$, $P(B)$ and $P(A \cap B)$ for 'even' and 'at most 4'. Does $P(A \cap B) = P(A)P(B)$ hold?`, expected: '1/2, 2/3 and 1/3; and 1/2 × 2/3 = 1/3, so yes.' },
      { question: "Surprised? 'Even' and 'at most 4' feel related. What does this tell you about how independence is decided?", expected: 'Independence is decided by the numbers, not by intuition about whether the events are related.', probesMisconception: 'independence-judged-causally' },
      { question: "Now take A = 'even' and C = 'odd'. They are disjoint. Are they independent?", expected: 'No: P(A ∩ C) = 0 but P(A)P(C) = 1/4. Knowing the roll is even makes odd impossible — the strongest possible dependence.', probesMisconception: 'independent-vs-disjoint' },
    ],
    workedExample: {
      problem: "A survey of 200 adults: 80 are smokers and 120 are not; 50 of the smokers and 75 of the non-smokers drink coffee daily. Are 'smoker' and 'daily coffee drinker' independent?",
      steps: [
        r`$P(S) = 80/200 = 0.4$; $P(C) = 125/200 = 0.625$; $P(S \cap C) = 50/200 = 0.25$.`,
        r`Product: $0.4 \times 0.625 = 0.25 = P(S \cap C)$, so the events are independent.`,
        r`Check with the other definition: $P(C \mid S) = 50/80 = 0.625 = P(C)$.`,
      ],
    },
    transfer: {
      prompt: "Two machines fail on any given day independently, with probabilities 0.1 and 0.05. Find the probability that both fail today and the probability that at least one fails. Are the events 'machine 1 fails' and 'machine 2 fails' disjoint?",
      reference: r`Both: $0.1 \times 0.05 = 0.005$. At least one: $1 - 0.9 \times 0.95 = 0.145$. They are not disjoint — both can fail on the same day (probability 0.005) — and they are independent.`,
    },
    hints: [
      'Independence is a claim about numbers: does knowing one event happened change the probability of the other?',
      'Compute P(A), P(B) and P(A ∩ B) by listing outcomes, then check whether P(A ∩ B) = P(A) × P(B).',
      'A = {2, 4, 6} so P(A) = 1/2; B = {1, 2, 3, 4} so P(B) = 2/3; A ∩ B = {2, 4}. Find P(A ∩ B) and compare it with 1/2 × 2/3.',
    ],
  },
  teach: {
    keyIdea: 'A and B are independent exactly when P(A and B) = P(A)P(B), i.e. learning one does not change the probability of the other; disjoint events with positive probability are never independent.',
    answer: "Two events are independent when learning that one happened tells you nothing about the other: P(B | A) = P(B), or equivalently P(A and B) = P(A) × P(B). The test is numerical. Roll a die: A = even, B = at most 4. P(A) = 1/2, P(B) = 2/3, and P(A and B) = P({2, 4}) = 1/3, which equals 1/2 × 2/3 — so they're independent, even though they sound related. The most common confusion is with disjoint events. 'Even' and 'odd' can't both happen; people say 'so they don't affect each other'. But if I tell you the roll is even, the chance it's odd drops from 1/2 to 0 — that's a huge effect. Disjoint events with positive probability are always dependent. Independence is what lets you multiply probabilities, like P(two machines both fail) = 0.1 × 0.05, and that's only legitimate when the failures really don't influence each other.",
  },
  items: [
    { type: 'recall', prompt: r`Give two equivalent definitions of independence of events $A$ and $B$.`, answer: r`$P(A \mid B) = P(A)$ (knowing $B$ does not change the probability of $A$), and $P(A \cap B) = P(A)\,P(B)$. They are equivalent because $P(A \mid B) = P(A \cap B)/P(B)$.` },
    {
      type: 'apply',
      prompt: "A fair coin is flipped 3 times. Let A = 'the first flip is heads' and B = 'exactly two heads in total'. Are A and B independent? Show the calculation.",
      answer: r`$P(A) = 1/2$. B = {HHT, HTH, THH}, so $P(B) = 3/8$. $A \cap B$ = {HHT, HTH}, so $P(A \cap B) = 2/8 = 1/4$. Since $P(A)P(B) = 3/16 \ne 1/4$, they are not independent (knowing the first flip is heads raises the chance of exactly two heads from 3/8 to 1/2).`,
      exact: 'not independent',
      rubric: ['Finds P(A) = 1/2 and P(B) = 3/8.', 'Finds P(A ∩ B) = 1/4.', 'Concludes not independent because 1/4 ≠ 3/16.'],
    },
    {
      type: 'apply',
      prompt: 'Two independent components each work with probability 0.9. A system works if at least one component works. What is P(system works)?',
      answer: r`Both fail with probability $0.1 \times 0.1 = 0.01$ (independence), so P(system works) = $1 - 0.01 = 0.99$.`,
      exact: '0.99',
      rubric: ['Uses independence to multiply the failure probabilities 0.1 × 0.1.', 'Uses the complement of both failing.', 'Gives 0.99.'],
    },
    {
      type: 'discriminate',
      prompt: 'Explain the difference between independent events and disjoint (mutually exclusive) events. Can two events with positive probability be both? Give an example of each.',
      answer: r`Disjoint means the events cannot occur together: $P(A \cap B) = 0$. Independent means knowing one does not change the other: $P(A \cap B) = P(A)P(B)$. If both have positive probability they cannot be both: disjointness gives $P(A \cap B) = 0$ while independence would require $P(A)P(B) > 0$. Disjoint example: 'even' and 'odd' on one die roll. Independent example: 'first coin heads' and 'second coin heads' — both can happen, with probability 1/4 = 1/2 × 1/2.`,
      rubric: [
        'Defines disjoint as P(A ∩ B) = 0 (cannot occur together).',
        'Defines independent as P(A ∩ B) = P(A)P(B) (knowing one does not change the other).',
        'Explains that disjoint events with positive probabilities are never independent (0 ≠ P(A)P(B) > 0).',
        'Gives a correct example of each.',
      ],
      tags: ['independent-vs-disjoint'],
    },
    {
      type: 'explain',
      prompt: "A student says: 'Rolling a 6 and rolling an odd number are independent, because they can't both happen, so one doesn't affect the other.' Explain what is wrong with this.",
      answer: r`The events are disjoint, not independent. Test the definition: $P(\text{odd}) = 1/2$ but $P(\text{odd} \mid 6) = 0$, so learning that the roll is a 6 changes the probability of odd (to zero). Equivalently $P(6 \cap \text{odd}) = 0 \ne P(6)P(\text{odd}) = 1/12$. 'Cannot both happen' is the strongest possible dependence — one event rules the other out — not independence.`,
      rubric: [
        'Identifies the events as disjoint.',
        'Shows dependence numerically: P(odd | 6) = 0 ≠ 1/2, or P(6 ∩ odd) = 0 ≠ 1/12.',
        "States that 'cannot both happen' is strong dependence, not independence.",
      ],
      tags: ['independent-vs-disjoint'],
    },
    { type: 'cloze', prompt: r`If $A$ and $B$ are independent then $P(A \cap B) = $ ____ and $P(A \mid B) = $ ____.`, answer: 'P(A) P(B); P(A)' },
  ],
};

export const lawOfTotalProbability: ConceptSpec = {
  id: 'c-law-of-total-probability',
  name: 'The law of total probability',
  definition: r`If $B_1, \dots, B_k$ partition the sample space (disjoint and exhaustive), then $P(A) = \sum_i P(A \mid B_i)\,P(B_i)$: the overall probability of $A$ is a weighted average of its conditional probabilities, weighted by how likely each case is.`,
  objectives: [
    ['understand', "Explain the rule as 'reasoning by cases' with a tree diagram, combining the multiplication and addition rules."],
    ['apply', 'Compute overall rates (defect rate, positive-test rate, rain probability) from case probabilities and conditional probabilities.'],
    ['analyze', 'Recognise when a probability should be computed by cases and check that the cases form a partition.'],
  ],
  misconceptions: [
    {
      tag: 'unweighted-average-of-conditionals',
      description: 'Averages the conditional probabilities without weighting by the probability of each case.',
      remedy: 'Take an extreme mix: 99% of parts from a line with 1% defects and 1% from a line with 50%. The overall rate is nowhere near 25.5%.',
    },
    {
      tag: 'forgets-a-case',
      description: 'Omits a branch of the partition, so the case probabilities do not sum to 1.',
      remedy: 'Ask them to add up the case probabilities before combining; if they do not reach 1, a case is missing.',
    },
  ],
  examples: [
    { title: 'Overall defect rate', body: r`Line A: 70% of output, 2% defective; line B: 30%, 5%. $P(D) = 0.7 \times 0.02 + 0.3 \times 0.05 = 0.029$.`, domain: 'manufacturing' },
    { title: 'Overall positive rate', body: r`Prevalence 1%, sensitivity 95%, false-positive rate 8%: $P(+) = 0.01 \times 0.95 + 0.99 \times 0.08 = 0.0887$.`, domain: 'medicine' },
    { title: 'Rain by regime', body: r`Frontal (0.3, rain 0.8), convective (0.2, rain 0.5), settled (0.5, rain 0.05): $P(\text{rain}) = 0.24 + 0.10 + 0.025 = 0.365$.`, domain: 'weather' },
  ],
  script: {
    pretest: {
      prompt: 'Line A makes 70% of a factory\'s parts with a 2% defect rate; line B makes 30% with a 5% defect rate. What fraction of all parts are defective?',
      isomorph: 'A disease has prevalence 1%. A test is positive for 95% of people who have it and for 8% of people who do not. What fraction of all tests come back positive?',
      reference: r`$0.7 \times 0.02 + 0.3 \times 0.05 = 0.014 + 0.015 = 0.029$. (Isomorph: $0.01 \times 0.95 + 0.99 \times 0.08 = 0.0095 + 0.0792 = 0.0887$.)`,
    },
    guidingQuestions: [
      { question: "A defective part must have come from exactly one line. What are the two 'ways' a part can be defective?", expected: 'From A and defective, or from B and defective — disjoint cases that cover every defective part.', probesMisconception: 'forgets-a-case' },
      { question: 'How likely is each of those two ways?', expected: 'P(A ∩ D) = 0.7 × 0.02 = 0.014 and P(B ∩ D) = 0.3 × 0.05 = 0.015, by the multiplication rule.' },
      { question: 'Why are we allowed to add these two numbers?', expected: 'The cases are disjoint, so the addition rule for disjoint events applies: P(D) = 0.029.' },
      { question: 'A colleague averages 2% and 5% to get 3.5%. Why is that wrong here?', expected: 'It ignores that line A makes more than twice as many parts; the conditionals must be weighted by the shares 0.7 and 0.3.', probesMisconception: 'unweighted-average-of-conditionals' },
    ],
    workedExample: {
      problem: 'Urn I has 3 red and 2 blue balls; urn II has 1 red and 4 blue. A fair coin decides the urn, then one ball is drawn. What is the probability the ball is red?',
      steps: [
        r`Cases: $P(\text{I}) = P(\text{II}) = 1/2$.`,
        r`Conditionals: $P(R \mid \text{I}) = 3/5$, $P(R \mid \text{II}) = 1/5$.`,
        r`$P(R) = \tfrac12 \cdot \tfrac35 + \tfrac12 \cdot \tfrac15 = \tfrac{3}{10} + \tfrac{1}{10} = \tfrac{2}{5}$.`,
      ],
    },
    transfer: {
      prompt: "Forecasters say tomorrow's weather regime will be 'frontal' with probability 0.3, 'convective' with probability 0.2, or 'settled' with probability 0.5. The probability of rain is 0.8 in a frontal regime, 0.5 in a convective one and 0.05 in a settled one. What is P(rain)?",
      reference: r`$0.3 \times 0.8 + 0.2 \times 0.5 + 0.5 \times 0.05 = 0.24 + 0.10 + 0.025 = 0.365$.`,
    },
    hints: [
      "Split 'defective' into the different ways it could happen — one for each line.",
      'For each line, compute P(that line AND defective) with the multiplication rule; then add the cases.',
      'P(A and defective) = 0.7 × 0.02 = 0.014. Compute P(B and defective) the same way, then add the two.',
    ],
  },
  teach: {
    keyIdea: 'P(A) = Σ P(A | Bi) P(Bi) over a set of disjoint, exhaustive cases: a weighted average of the conditional probabilities, weighted by the case probabilities.',
    answer: "The law of total probability is reasoning by cases. If you know how likely A is in each of several situations, and how likely each situation is, you can get the overall probability of A: multiply within each case and add across cases. Factory example: line A makes 70% of parts with a 2% defect rate, line B makes 30% with 5%. A defective part came either from A (0.7 × 0.02 = 0.014 of all parts) or from B (0.3 × 0.05 = 0.015), so 2.9% of parts are defective overall. Notice it's a weighted average of 2% and 5% — closer to 2% because A produces more. The naive average 3.5% is wrong. Two checks: the cases must be disjoint and cover everything (their probabilities add to 1), and each product is P(case) × P(A | case), which is just the multiplication rule.",
  },
  items: [
    { type: 'recall', prompt: r`State the law of total probability for a partition $B_1, \dots, B_k$, and say what 'partition' requires.`, answer: r`$P(A) = \sum_{i=1}^k P(A \mid B_i)\,P(B_i)$. A partition is a collection of events that are pairwise disjoint and whose union is the whole sample space, so exactly one $B_i$ occurs.` },
    {
      type: 'apply',
      prompt: "A clinic's patients are 60% adults and 40% children. 10% of adult visits and 25% of child visits are for vaccinations. What fraction of all visits are for vaccinations?",
      answer: r`$0.6 \times 0.10 + 0.4 \times 0.25 = 0.06 + 0.10 = 0.16$.`,
      exact: '0.16',
      rubric: ['Forms the two case products 0.6 × 0.10 and 0.4 × 0.25.', 'Adds the cases.', 'Gives 0.16.'],
    },
    {
      type: 'apply',
      prompt: 'A factory has three lines producing 50%, 30% and 20% of output, with defect rates 1%, 2% and 4% respectively. What is the overall defect rate?',
      answer: r`$0.5 \times 0.01 + 0.3 \times 0.02 + 0.2 \times 0.04 = 0.005 + 0.006 + 0.008 = 0.019$, i.e. 1.9%.`,
      exact: '0.019',
      rubric: ['Weights each defect rate by its line share.', 'Includes all three lines.', 'Gives 0.019.'],
    },
    {
      type: 'explain',
      prompt: "Explain why the overall defect rate of a factory with two lines is a weighted average of the lines' defect rates, and why a simple average would be wrong in general.",
      answer: r`A part is defective if it comes from A and is defective, or comes from B and is defective — disjoint cases. By the multiplication rule these have probabilities $P(A)P(D \mid A)$ and $P(B)P(D \mid B)$, and by additivity $P(D) = P(D \mid A)P(A) + P(D \mid B)P(B)$. The weights are the output shares $P(A)$ and $P(B)$, which sum to 1, so $P(D)$ is a weighted average of the two conditional rates. A simple average uses weights 1/2 and 1/2, which is only correct when the lines produce equal shares.`,
      rubric: [
        'Writes P(D) = P(D | A)P(A) + P(D | B)P(B) or equivalent.',
        'Identifies the weights as the output shares P(A), P(B).',
        'Justifies the formula via disjoint cases (tree diagram / multiplication and addition rules).',
        'States that the simple average is correct only when the shares are equal.',
      ],
      tags: ['unweighted-average-of-conditionals'],
    },
    {
      type: 'predict',
      prompt: 'Before computing: 95% of parts come from line A (1% defective) and 5% from line B (30% defective). Will the overall defect rate be closer to 1% or to 15.5% (the simple average)? Then compute it.',
      answer: r`Closer to 1%, because line A dominates. $0.95 \times 0.01 + 0.05 \times 0.30 = 0.0095 + 0.015 = 0.0245$, about 2.5%.`,
    },
  ],
};

export const bayesTheorem: ConceptSpec = {
  id: 'c-bayes-theorem',
  name: "Bayes' theorem",
  definition: r`Bayes' theorem reverses the direction of conditioning: $P(B \mid A) = \dfrac{P(A \mid B)\,P(B)}{P(A)}$, where the denominator is usually expanded by the law of total probability. It updates a prior $P(B)$ to a posterior $P(B \mid A)$ in the light of evidence $A$.`,
  objectives: [
    ['understand', "Derive Bayes' theorem from the two forms of the multiplication rule."],
    ['apply', 'Compute posterior probabilities in two-hypothesis problems (which line, which urn, spam or not).'],
    ['analyze', 'Interpret prior, likelihood and posterior, and explain which direction the evidence moves the probability.'],
  ],
  misconceptions: [
    {
      tag: 'inverse-fallacy',
      description: 'Equates P(A | B) with P(B | A), e.g. answers a which-line question with the defect rate.',
      remedy: 'Show that both share the numerator P(A ∩ B) but divide by different totals; compute both in a table.',
    },
    {
      tag: 'forgets-normalising-denominator',
      description: 'Reports P(A | B)P(B) as the posterior without dividing by P(A).',
      remedy: 'Ask whether the posteriors over all hypotheses add to 1; if not, the denominator is missing.',
    },
  ],
  examples: [
    { title: 'Which line?', body: r`Line A: 70%, 2% defective; line B: 30%, 5%. Given a defective part, $P(B \mid D) = \frac{0.3 \times 0.05}{0.029} = \frac{15}{29} \approx 0.52$.`, domain: 'manufacturing' },
    { title: 'Spam filter', body: r`20% of mail is spam; 'offer' appears in 60% of spam and 5% of legitimate mail. $P(\text{spam} \mid \text{offer}) = \frac{0.12}{0.12 + 0.04} = 0.75$.`, domain: 'technology' },
    { title: 'Two-headed coin', body: r`One fair coin and one two-headed coin; one is picked at random and shows heads twice. $P(\text{two-headed} \mid HH) = \frac{1/2 \cdot 1}{1/2 \cdot 1 + 1/2 \cdot 1/4} = 4/5$.`, domain: 'games' },
  ],
  script: {
    pretest: {
      prompt: 'Line A makes 70% of parts (2% defective) and line B makes 30% (5% defective). A randomly chosen part is found to be defective. What is the probability that it came from line B?',
      isomorph: 'Urn I holds 3 red and 2 blue balls; urn II holds 1 red and 4 blue. A fair coin picks the urn and a red ball is drawn. What is the probability that the urn was I?',
      reference: r`$P(B \mid D) = \frac{0.3 \times 0.05}{0.7 \times 0.02 + 0.3 \times 0.05} = \frac{0.015}{0.029} = \frac{15}{29} \approx 0.517$. (Isomorph: $\frac{1/2 \cdot 3/5}{2/5} = 3/4$.)`,
    },
    guidingQuestions: [
      { question: r`We want $P(B \mid \text{defective})$. What is the definition of that conditional probability?`, expected: 'P(B ∩ D) / P(D).' },
      { question: r`How do you get $P(B \cap D)$? And $P(D)$?`, expected: 'P(B ∩ D) = P(B) P(D | B) = 0.3 × 0.05 = 0.015 by the multiplication rule; P(D) = 0.014 + 0.015 = 0.029 by the law of total probability.', probesMisconception: 'forgets-normalising-denominator' },
      { question: 'So what is the posterior? Compare it with the prior P(B) = 0.3: which way did the evidence push it, and why?', expected: '15/29 ≈ 0.52, up from 0.3, because B has the higher defect rate so a defective part is evidence for B.' },
      { question: 'Why is the answer not simply 5%, the defect rate of line B?', expected: '5% is P(D | B), the reverse conditional. We want P(B | D), which depends on the prior shares and on line A\'s rate too.', probesMisconception: 'inverse-fallacy' },
    ],
    workedExample: {
      problem: "An email filter: 20% of incoming mail is spam. The word 'offer' appears in 60% of spam messages and in 5% of legitimate ones. An email contains 'offer'. What is the probability it is spam?",
      steps: [
        r`Prior: $P(\text{spam}) = 0.2$, $P(\text{legit}) = 0.8$. Likelihoods: $P(\text{offer} \mid \text{spam}) = 0.6$, $P(\text{offer} \mid \text{legit}) = 0.05$.`,
        r`Total probability: $P(\text{offer}) = 0.2 \times 0.6 + 0.8 \times 0.05 = 0.12 + 0.04 = 0.16$.`,
        r`Posterior: $P(\text{spam} \mid \text{offer}) = 0.12 / 0.16 = 0.75$. The evidence raised the probability from 0.2 to 0.75.`,
      ],
    },
    transfer: {
      prompt: 'Two coins are in a pocket: one fair, one with heads on both sides. One is picked at random and flipped twice, landing heads both times. What is the probability that it is the two-headed coin?',
      reference: r`$P(HH \mid \text{fair}) = 1/4$, $P(HH \mid \text{two-headed}) = 1$. $P(HH) = \tfrac12 \cdot \tfrac14 + \tfrac12 \cdot 1 = 5/8$. Posterior $= \frac{1/2 \cdot 1}{5/8} = 4/5$.`,
    },
    hints: [
      'You know how likely a defect is given each line; the question turns that around. Start from the definition of P(B | defective).',
      'Numerator: P(B and defective) by the multiplication rule. Denominator: P(defective) by the law of total probability.',
      'P(B and D) = 0.3 × 0.05 = 0.015; P(A and D) = 0.7 × 0.02 = 0.014; so P(D) = 0.029. Now divide the B share by the total.',
    ],
  },
  teach: {
    keyIdea: "P(B | A) = P(A | B) P(B) / P(A): Bayes' theorem turns 'probability of the evidence given the hypothesis' into 'probability of the hypothesis given the evidence', with the prior and a normalising total in the mix.",
    answer: "Bayes' theorem lets you reverse a conditional probability. Suppose a factory's line A makes 70% of parts with a 2% defect rate and line B makes 30% with 5%. You find a defective part — which line is it from? You know P(defective | B) = 0.05, but you want P(B | defective). Write it as P(B and defective) / P(defective). The numerator is 0.3 × 0.05 = 0.015. The denominator is the total defect probability, adding both lines: 0.014 + 0.015 = 0.029. So P(B | defective) = 0.015/0.029 ≈ 0.52. The prior, 0.3, has been updated to a posterior of 0.52 because a defect is more typical of B. Two errors to avoid: answering '5%' (that's the reverse conditional), and forgetting to divide by the total — you can check by verifying the posteriors for A and B add to 1.",
  },
  items: [
    { type: 'recall', prompt: r`State Bayes' theorem for two hypotheses $B$ and $B^c$ with evidence $A$, with the denominator expanded.`, answer: r`$P(B \mid A) = \dfrac{P(A \mid B)\,P(B)}{P(A \mid B)\,P(B) + P(A \mid B^c)\,P(B^c)}$.` },
    {
      type: 'apply',
      prompt: 'Urn I contains 2 red and 8 blue balls; urn II contains 6 red and 4 blue. An urn is chosen at random and one ball is drawn; it is red. What is the probability that the urn was II?',
      answer: r`$P(R) = 0.5 \times 0.2 + 0.5 \times 0.6 = 0.4$. $P(\text{II} \mid R) = \frac{0.5 \times 0.6}{0.4} = \frac{0.3}{0.4} = 0.75$.`,
      exact: '3/4',
      rubric: ['Computes the numerator 0.5 × 0.6 = 0.3.', 'Computes P(red) = 0.4 by total probability.', 'Gives 0.75.'],
    },
    {
      type: 'apply',
      prompt: "Of a company's incoming customer emails, 30% are complaints. The word 'refund' appears in 50% of complaints and in 4% of other emails. An email contains 'refund'. What is the probability that it is a complaint?",
      answer: r`$P(\text{refund}) = 0.3 \times 0.5 + 0.7 \times 0.04 = 0.15 + 0.028 = 0.178$. $P(\text{complaint} \mid \text{refund}) = 0.15 / 0.178 \approx 0.843$.`,
      exact: '0.843',
      notes: 'Exact value 75/89 ≈ 0.8427; accept 0.84.',
      rubric: ['Computes the numerator 0.3 × 0.5 = 0.15.', 'Computes P(refund) = 0.178 including the non-complaint branch.', 'Gives ≈ 0.84.'],
    },
    {
      type: 'explain',
      prompt: "Derive Bayes' theorem from the multiplication rule, and explain the meaning of prior, likelihood and posterior in the context of a defective part that came from one of two production lines.",
      answer: r`The multiplication rule gives $P(A \cap B)$ two ways: $P(A \mid B)P(B) = P(B \mid A)P(A)$. Dividing by $P(A)$ gives $P(B \mid A) = P(A \mid B)P(B)/P(A)$, and $P(A)$ is found by the law of total probability. For the factory: the prior $P(\text{line B})$ is the share of parts B makes before we look at the part; the likelihood $P(\text{defective} \mid \text{line B})$ is B's defect rate; the posterior $P(\text{line B} \mid \text{defective})$ is the updated probability that the part came from B once we know it is defective.`,
      rubric: [
        'Writes P(A ∩ B) both ways: P(A | B)P(B) = P(B | A)P(A).',
        'Rearranges to P(B | A) = P(A | B)P(B)/P(A).',
        'Identifies prior = P(line), likelihood = P(defective | line), posterior = P(line | defective).',
        'Notes that P(A) is computed by the law of total probability.',
      ],
    },
    {
      type: 'discriminate',
      prompt: r`Contrast $P(\text{defective} \mid \text{line B})$ with $P(\text{line B} \mid \text{defective})$ for a factory where line B makes 30% of parts with a 5% defect rate and line A makes 70% with a 2% defect rate. Compute both and explain why they differ.`,
      answer: r`$P(D \mid B) = 0.05$ is given: 5% of B's output is defective. $P(B \mid D) = \frac{0.3 \times 0.05}{0.7 \times 0.02 + 0.3 \times 0.05} = \frac{0.015}{0.029} \approx 0.52$: about half of all defective parts come from B. They differ because they condition on different events — the first divides the B-and-defective parts by all of B's parts, the second divides them by all defective parts — and the second depends on B's share of production and on line A's defect rate, neither of which enters the first.`,
      rubric: [
        'States P(D | B) = 0.05.',
        'Computes P(B | D) = 0.015/0.029 ≈ 0.52.',
        'Explains that the two condition on different events (denominators P(B) versus P(D)).',
        "Notes that the posterior depends on B's prior share and on line A's defect rate.",
      ],
      tags: ['inverse-fallacy'],
    },
  ],
};

export const baseRateReasoning: ConceptSpec = {
  id: 'c-base-rate-reasoning',
  name: 'Bayes with base rates: screening tests',
  definition: r`When a condition is rare, even an accurate test produces many false positives relative to true positives, so $P(\text{disease} \mid \text{positive})$ can be far below the test's sensitivity. Reasoning with natural frequencies ("out of 100,000 people…") makes the base rate impossible to ignore.`,
  objectives: [
    ['apply', 'Compute the positive predictive value from prevalence, sensitivity and specificity, using natural frequencies or Bayes.'],
    ['understand', 'Explain why the positive predictive value falls as prevalence falls.'],
    ['analyze', 'Translate a Bayes problem into a natural-frequency table and distinguish sensitivity, specificity and predictive value.'],
  ],
  misconceptions: [
    {
      tag: 'base-rate-neglect',
      description: 'Ignores prevalence and takes P(disease | positive) to be the sensitivity (or "test accuracy").',
      remedy: 'Build a natural-frequency table for 100,000 people; count true and false positives explicitly.',
    },
    {
      tag: 'specificity-equals-ppv',
      description: "Reads 'specificity 95%' as '95% of positives are real'.",
      remedy: 'Define specificity as P(negative | healthy) and ask what fraction of the (large) healthy group tests positive.',
    },
  ],
  examples: [
    { title: 'Rare disease', body: r`Prevalence 1/1000, sensitivity 99%, false-positive rate 5%: per 100,000 people, 99 true positives and 4995 false positives, so $P(\text{disease} \mid +) = 99/5094 \approx 0.02$.`, domain: 'medicine' },
    { title: 'Airport scanner', body: r`1 in 10,000 bags has a prohibited item; the scanner alarms on 98% of them and on 1% of clean bags. $P(\text{item} \mid \text{alarm}) = 98/(98 + 9999) \approx 0.01$.`, domain: 'security' },
    { title: 'Fraud detector', body: r`0.5% of transactions are fraud; the detector flags 90% of fraud and 2% of legitimate transactions. $P(\text{fraud} \mid \text{flag}) = 0.0045/(0.0045 + 0.0199) \approx 0.18$.`, domain: 'finance' },
  ],
  script: {
    pretest: {
      prompt: 'A disease affects 1 in 1000 people. A test detects it 99% of the time when it is present, and gives a false positive 5% of the time when it is absent. You test positive. Roughly what is the probability that you have the disease?',
      isomorph: 'A fraud detector flags 90% of fraudulent transactions and 2% of legitimate ones; 0.5% of transactions are fraudulent. A transaction is flagged. What is the probability that it is fraudulent?',
      reference: r`Per 100,000 people: 100 have the disease, 99 of them test positive; 99,900 do not, 4995 of them test positive. $P(\text{disease} \mid +) = 99/(99 + 4995) = 99/5094 \approx 0.019$, about 2%. (Isomorph: $0.0045/(0.0045 + 0.0199) \approx 0.18$.)`,
    },
    guidingQuestions: [
      { question: 'Imagine 100,000 people take the test. How many of them actually have the disease?', expected: '100 (1 in 1000).' },
      { question: 'How many of those 100 test positive? And how many of the 99,900 healthy people test positive?', expected: '99 true positives; 0.05 × 99,900 = 4995 false positives.' },
      { question: 'So among everyone who tests positive, what fraction is truly sick?', expected: '99 / (99 + 4995) ≈ 0.019, about 2%.', probesMisconception: 'base-rate-neglect' },
      { question: "The test is '99% accurate'. Why is the answer nowhere near 99%?", expected: 'The healthy group is 1000 times larger, so even a 5% false-positive rate produces far more false positives than there are true positives.', probesMisconception: 'specificity-equals-ppv' },
      { question: 'What would happen to the answer if the prevalence rose to 1 in 10?', expected: 'Per 100 people: 9.9 true positives and 4.5 false positives, so about 0.69. The base rate drives the answer.' },
    ],
    workedExample: {
      problem: 'Airport security: 1 in 10,000 bags contains a prohibited item. The scanner alarms on 98% of such bags and on 1% of clean bags. A bag triggers the alarm. What is the probability that it contains a prohibited item?',
      steps: [
        'Take 1,000,000 bags: 100 contain an item, 999,900 are clean.',
        'Alarms among the 100: 0.98 × 100 = 98. Alarms among the clean bags: 0.01 × 999,900 = 9999.',
        r`$P(\text{item} \mid \text{alarm}) = 98/(98 + 9999) = 98/10{,}097 \approx 0.0097$, about 1%.`,
        'Same result via Bayes: (0.0001 × 0.98) / (0.0001 × 0.98 + 0.9999 × 0.01).',
      ],
    },
    transfer: {
      prompt: 'A workplace drug test has sensitivity 95% and specificity 97%. If 2% of employees use the drug, what fraction of positive tests are correct? What if 20% use it?',
      reference: r`At 2%: $\frac{0.02 \times 0.95}{0.02 \times 0.95 + 0.98 \times 0.03} = \frac{0.019}{0.0484} \approx 0.39$. At 20%: $\frac{0.19}{0.19 + 0.024} \approx 0.89$. The same test is far more informative when the condition is common.`,
    },
    hints: [
      'Instead of percentages, imagine a concrete population — say 100,000 people — and sort them into four groups.',
      'Count true positives (sick and positive) and false positives (healthy and positive). The answer is true positives over all positives.',
      '100,000 people: 100 have the disease, 99,900 do not. Positives among the sick: 0.99 × 100 = 99. Positives among the healthy: 0.05 × 99,900 = 4995. Now form the fraction.',
    ],
  },
  teach: {
    keyIdea: 'P(disease | positive) = true positives / (true positives + false positives), and when the disease is rare the false positives from the huge healthy group dominate, so the answer can be far below the sensitivity.',
    answer: "Here's a result that surprises almost everyone. A disease affects 1 in 1000 people; a test catches 99% of cases and gives a false alarm 5% of the time. You test positive — how worried should you be? Picture 100,000 people. 100 have the disease and 99 of them test positive. 99,900 are healthy, and 5% of them — 4995 people — also test positive. So among positive tests only 99 out of about 5094 are real: about 2%. The test's 99% is P(positive | disease); what you want is P(disease | positive), and the tiny base rate flips the picture. The lesson: always ask 'how common is this to begin with?' — and if percentages are confusing, count people. The same test in a high-risk clinic where 1 in 10 has the disease gives about 69%, so predictive value depends on where the test is used.",
  },
  items: [
    {
      type: 'apply',
      prompt: 'A condition has prevalence 2%. A test has sensitivity 90% and a false-positive rate of 10%. What is P(condition | positive)?',
      answer: r`$\frac{0.02 \times 0.90}{0.02 \times 0.90 + 0.98 \times 0.10} = \frac{0.018}{0.018 + 0.098} = \frac{0.018}{0.116} \approx 0.155$.`,
      exact: '0.155',
      notes: 'Exact 9/58 ≈ 0.1552; accept 0.16.',
      rubric: ['Computes true-positive probability 0.02 × 0.90 = 0.018.', 'Computes false-positive probability 0.98 × 0.10 = 0.098.', 'Gives 0.018/0.116 ≈ 0.155.'],
    },
    {
      type: 'apply',
      prompt: 'Use natural frequencies with 20,000 people. Prevalence is 0.5%, sensitivity 100%, specificity 95%. How many true positives and false positives are there, and what fraction of positive results are true positives?',
      answer: '20,000 × 0.005 = 100 people have the condition and all 100 test positive (sensitivity 100%). 19,900 do not; 5% of them, 995, test positive. Fraction of positives that are true: 100 / (100 + 995) = 100/1095 ≈ 0.091.',
      exact: '100 true positives; 995 false positives; 100/1095 ≈ 0.091',
      rubric: ['Finds 100 true positives.', 'Finds 995 false positives (5% of 19,900).', 'Gives 100/1095 ≈ 0.09.'],
    },
    {
      type: 'explain',
      prompt: 'Explain why a positive result from a highly accurate test for a rare disease can still mean the patient is probably healthy.',
      answer: r`Because the disease is rare, almost everyone tested is healthy, and even a small false-positive rate applied to that large group produces many false positives. The true positives come from the small sick group. The probability of disease given a positive test is (true positives) / (true positives + false positives), which is small when false positives dominate. Example: prevalence 1/1000, sensitivity 99%, false-positive rate 5%: per 100,000 people there are 99 true positives and 4995 false positives, so $P(\text{disease} \mid +) \approx 2\%$.`,
      rubric: [
        'Mentions that the base rate (prevalence) is small.',
        'Explains that false positives come from the large healthy group and outnumber the true positives.',
        'States the posterior as TP/(TP + FP) or applies Bayes.',
        'Gives a numerical illustration.',
      ],
      tags: ['base-rate-neglect'],
    },
    {
      type: 'discriminate',
      prompt: 'Distinguish sensitivity, specificity and positive predictive value. Which of them depends on the prevalence of the condition, and why?',
      answer: r`Sensitivity $= P(\text{positive} \mid \text{disease})$: the fraction of sick people the test catches. Specificity $= P(\text{negative} \mid \text{no disease})$: the fraction of healthy people it correctly clears. Positive predictive value $= P(\text{disease} \mid \text{positive})$: the fraction of positive results that are correct. Only the PPV depends on prevalence: it is computed by Bayes' theorem, in which the numbers of true and false positives are scaled by the sizes of the sick and healthy groups. Sensitivity and specificity are properties of the test alone.`,
      rubric: [
        'Defines sensitivity as P(positive | disease).',
        'Defines specificity as P(negative | no disease).',
        'Defines positive predictive value as P(disease | positive).',
        'States that only the PPV depends on prevalence, via Bayes.',
      ],
      tags: ['specificity-equals-ppv'],
    },
    {
      type: 'predict',
      prompt: 'Before computing: a test with sensitivity 99% and specificity 99% is used where the prevalence is 0.1%. Will the fraction of positive testers who are really sick be above or below 50%? Then compute it.',
      answer: r`Below 50%. $\frac{0.001 \times 0.99}{0.001 \times 0.99 + 0.999 \times 0.01} = \frac{0.00099}{0.00099 + 0.00999} \approx 0.09$, about 9%.`,
    },
    { type: 'cloze', prompt: r`Positive predictive value $= \dfrac{\text{true positives}}{\text{true positives} + \_\_\_\_}$; when the disease is rare the ____ term dominates the denominator.`, answer: 'false positives; false-positive' },
  ],
};

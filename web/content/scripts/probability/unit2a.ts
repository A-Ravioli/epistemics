/** Unit 2, lessons 1-2: random variables, expectation, linearity, variance; Bernoulli, binomial, geometric, memorylessness. */
import { r, type ConceptSpec } from './helpers.ts';

export const randomVariable: ConceptSpec = {
  id: 'c-random-variable',
  name: 'Random variables and PMFs',
  definition: r`A random variable $X$ assigns a number to each outcome of an experiment. For a discrete $X$, the probability mass function $p(x) = P(X = x)$ lists the probability of each value; the values are non-negative and sum to 1.`,
  objectives: [
    ['remember', 'Define a random variable and a probability mass function, and state the two properties a PMF must satisfy.'],
    ['apply', 'Derive the PMF of simple random variables (number of heads, sum of dice, number of defectives in a sample) by grouping outcomes.'],
    ['understand', 'Distinguish the random variable from its values and from the underlying outcomes.'],
  ],
  misconceptions: [
    {
      tag: 'random-variable-is-a-number',
      description: 'Thinks X is a fixed number rather than a rule assigning a number to each outcome.',
      remedy: "Ask: 'what is X when the outcome is HTH? and when it is TTT?' — X is the rule, 2 and 0 are its values.",
    },
    {
      tag: 'pmf-not-summing-to-one',
      description: 'Produces a PMF whose values do not add to 1 and does not notice.',
      remedy: 'Make summing the PMF a required final check; a missing or double-counted outcome shows up immediately.',
    },
  ],
  examples: [
    { title: 'Heads in three flips', body: r`$X$ = number of heads: $p(0) = 1/8$, $p(1) = 3/8$, $p(2) = 3/8$, $p(3) = 1/8$.`, domain: 'games' },
    { title: 'Defectives in a sample', body: r`Two parts drawn from 5 with 2 defective; $X$ = number defective: $p(0) = 3/10$, $p(1) = 6/10$, $p(2) = 1/10$.`, domain: 'manufacturing' },
    { title: 'Maximum of two dice', body: r`$Y = \max$ of two fair dice: $P(Y = 6) = 11/36$, $P(Y = 1) = 1/36$, and in general $P(Y = k) = (2k-1)/36$.`, domain: 'games' },
  ],
  script: {
    pretest: {
      prompt: 'A fair coin is flipped 3 times and X is the number of heads. Write the PMF of X.',
      isomorph: 'Two fair dice are rolled and X is the larger of the two values. Find P(X = 6) and P(X = 1).',
      reference: r`$p(0) = 1/8$, $p(1) = 3/8$, $p(2) = 3/8$, $p(3) = 1/8$ (sum 1). (Isomorph: $P(X = 6) = 11/36$, $P(X = 1) = 1/36$.)`,
    },
    guidingQuestions: [
      { question: 'List the 8 outcomes of three flips. What value does X take on each?', expected: 'HHH→3; HHT, HTH, THH→2; HTT, THT, TTH→1; TTT→0.' },
      { question: 'How many outcomes give X = 2? So what is P(X = 2)?', expected: 'Three outcomes, so 3/8.' },
      { question: 'Add up all four probabilities. What must they total, and why?', expected: '1/8 + 3/8 + 3/8 + 1/8 = 1, because every outcome gives exactly one value of X.', probesMisconception: 'pmf-not-summing-to-one' },
      { question: "Is X 'the number 2'? What exactly is X?", expected: 'X is the rule that maps each outcome to its number of heads; 2 is one of its possible values.', probesMisconception: 'random-variable-is-a-number' },
    ],
    workedExample: {
      problem: 'Two parts are drawn at random without replacement from a lot of 5 in which 2 are defective. X is the number of defective parts drawn. Find the PMF of X.',
      steps: [
        r`Equally likely samples: $\binom{5}{2} = 10$.`,
        r`$P(X = 0) = \binom{3}{2}/10 = 3/10$; $P(X = 2) = \binom{2}{2}/10 = 1/10$.`,
        r`$P(X = 1) = \binom{2}{1}\binom{3}{1}/10 = 6/10$.`,
        'Check: 3/10 + 6/10 + 1/10 = 1.',
      ],
    },
    transfer: {
      prompt: 'Two fair dice are rolled; Y is the absolute difference between them. What values can Y take? Find P(Y = 0) and P(Y = 5).',
      reference: r`$Y \in \{0, 1, 2, 3, 4, 5\}$. $P(Y = 0) = 6/36 = 1/6$ (doubles); $P(Y = 5) = 2/36 = 1/18$ (only (1,6) and (6,1)).`,
    },
    hints: [
      'Start by listing every outcome of the three flips, then write the number of heads next to each.',
      'Group the outcomes by their number of heads; the PMF value for k is the number of outcomes with k heads divided by 8.',
      'HHH → 3; HHT, HTH, THH → 2. Count the outcomes with 1 head and with 0 heads, divide each count by 8, and check the four probabilities sum to 1.',
    ],
  },
  teach: {
    keyIdea: 'a random variable is a rule assigning a number to each outcome, and its PMF gives the probability of each value, with the probabilities adding to 1.',
    answer: "A random variable is a number that depends on chance — more precisely, a rule that turns each outcome of an experiment into a number. Flip three coins: the outcomes are HHH, HHT, and so on; the random variable X = 'number of heads' turns HHT into 2 and TTT into 0. The probability mass function (PMF) tells you how likely each value is: group the 8 equally likely outcomes by their X value and you get P(X=0) = 1/8, P(X=1) = 3/8, P(X=2) = 3/8, P(X=3) = 1/8. Two checks: every probability is at least 0, and they add to 1 — if they don't, you've missed or double-counted an outcome. Keep straight three different things: the outcome (HHT), the random variable (the rule), and the value (2). Random variables matter because they let us talk about averages, spread and long-run behaviour, which is where the next lessons go.",
  },
  items: [
    { type: 'recall', prompt: 'What is a random variable, and what is a probability mass function? What two properties must a PMF satisfy?', answer: r`A random variable is a function that assigns a number to each outcome of an experiment. The PMF of a discrete random variable is $p(x) = P(X = x)$. It must satisfy $p(x) \ge 0$ for every $x$ and $\sum_x p(x) = 1$.` },
    {
      type: 'apply',
      prompt: 'Two fair dice are rolled and X is their sum. Find P(X = 4), P(X = 7) and P(X ≥ 11).',
      answer: r`Sum 4: (1,3), (2,2), (3,1): $3/36 = 1/12$. Sum 7: 6 outcomes, $6/36 = 1/6$. Sum ≥ 11: (5,6), (6,5), (6,6): $3/36 = 1/12$.`,
      exact: '1/12; 1/6; 1/12',
      rubric: ['Gives P(X = 4) = 3/36 = 1/12.', 'Gives P(X = 7) = 6/36 = 1/6.', 'Gives P(X ≥ 11) = 3/36 = 1/12.'],
    },
    {
      type: 'apply',
      prompt: 'A PMF is given as p(1) = 0.2, p(2) = c, p(3) = 0.3, p(4) = 0.1. Find c and P(X ≥ 2).',
      answer: 'The PMF sums to 1: 0.2 + c + 0.3 + 0.1 = 1, so c = 0.4. P(X ≥ 2) = 0.4 + 0.3 + 0.1 = 0.8 (or 1 − 0.2).',
      exact: 'c = 0.4; 0.8',
      rubric: ['Uses the sum-to-one property to get c = 0.4.', 'Sums the probabilities for X = 2, 3, 4 (or uses the complement).', 'Gives 0.8.'],
    },
    {
      type: 'explain',
      prompt: 'Explain the difference between an outcome, a random variable and a value of the random variable, using three coin flips as the example.',
      answer: "An outcome is one complete result of the experiment, such as HTH. A random variable is a rule that assigns a number to every outcome — for instance X = number of heads, which sends HTH to 2, HHH to 3 and TTT to 0. A value is one of the numbers the rule can produce, such as 2. Several outcomes can share the same value (HHT, HTH and THH all give X = 2), which is why P(X = 2) = 3/8 is found by counting outcomes.",
      rubric: [
        'Identifies an outcome as a single element like HTH.',
        'Identifies the random variable as a rule/function assigning a number to each outcome.',
        'Identifies a value as a specific number the rule produces (e.g. X = 2).',
        'Notes that several outcomes can give the same value.',
      ],
      tags: ['random-variable-is-a-number'],
    },
    { type: 'cloze', prompt: r`For a discrete random variable, the PMF must satisfy $p(x) \ge$ ____ for every $x$ and $\sum_x p(x) = $ ____.`, answer: '0; 1' },
  ],
};

export const expectation: ConceptSpec = {
  id: 'c-expectation',
  name: 'Expected value',
  definition: r`The expected value of a discrete random variable is the probability-weighted average of its values, $E[X] = \sum_x x\,p(x)$. It is the long-run average of $X$ over many repetitions — not the most likely value, and not necessarily a possible value.`,
  objectives: [
    ['apply', r`Compute $E[X]$ from a PMF.`],
    ['understand', r`Interpret $E[X]$ as a long-run average, including when it is not an attainable value.`],
    ['apply', 'Use expected value to evaluate a bet, a raffle or an insurance policy (expected net gain).'],
  ],
  misconceptions: [
    {
      tag: 'expectation-is-most-likely-value',
      description: 'Confuses the mean with the mode, or expects E[X] to be a value X can actually take.',
      remedy: 'Fair die: E[X] = 3.5 is never rolled; ask what 3.5 describes (the average of many rolls).',
    },
    {
      tag: 'expectation-ignores-weights',
      description: 'Averages the possible values without weighting by their probabilities.',
      remedy: 'Raffle with prizes 100, 20, 20, 0: the plain average 35 ignores that 97 of 100 tickets win nothing.',
    },
  ],
  examples: [
    { title: 'Fair die', body: r`$E[X] = (1 + 2 + 3 + 4 + 5 + 6)/6 = 3.5$.`, domain: 'games' },
    { title: 'Raffle ticket', body: r`100 tickets at \$2; one wins \$100, two win \$20. $E[\text{prize}] = 100(0.01) + 20(0.02) = \$1.40$, so the expected net gain is $-\$0.60$.`, domain: 'finance' },
    { title: 'Insurance policy', body: r`Premium \$300; pays \$10,000 with probability 0.02. Insurer's expected profit $= 300 - 0.02 \times 10{,}000 = \$100$ per policy.`, domain: 'finance' },
  ],
  script: {
    pretest: {
      prompt: 'A raffle sells 100 tickets at \\$2 each. One ticket wins \\$100 and two tickets win \\$20. What is the expected net gain from buying one ticket?',
      isomorph: 'A game: roll a fair die; you win \\$6 if it shows a six and lose \\$1 otherwise. What is your expected gain per play?',
      reference: r`$E[\text{prize}] = 100 \times 0.01 + 20 \times 0.02 + 0 \times 0.97 = \$1.40$; net gain $= 1.40 - 2 = -\$0.60$. (Isomorph: $6 \times \tfrac16 - 1 \times \tfrac56 = \$1/6 \approx \$0.17$.)`,
    },
    guidingQuestions: [
      { question: 'If you bought all 100 tickets, how much prize money would you collect in total, and how much is that per ticket?', expected: '\\$140 in total, \\$1.40 per ticket.' },
      { question: r`How does that relate to the formula $\sum x\,p(x)$?`, expected: 'It is the same computation: each prize times the fraction of tickets that win it: 100 × 0.01 + 20 × 0.02.' },
      { question: 'So what is the expected net gain from one ticket? Can any single ticket actually gain −\\$0.60?', expected: '−\\$0.60. No: a ticket nets +98, +18 or −2; the expectation is the average over many tickets.', probesMisconception: 'expectation-is-most-likely-value' },
      { question: "A friend says 'the average prize is (100 + 20 + 20 + 0)/4 = \\$35'. What's wrong?", expected: 'That ignores the probabilities: 97 of 100 tickets win nothing, so the values must be weighted by their probabilities.', probesMisconception: 'expectation-ignores-weights' },
    ],
    workedExample: {
      problem: 'X is the result of one roll of a fair die. Find E[X] and interpret it.',
      steps: [
        r`$E[X] = 1 \cdot \tfrac16 + 2 \cdot \tfrac16 + \cdots + 6 \cdot \tfrac16 = 21/6 = 3.5$.`,
        'Interpretation: over many rolls the average result approaches 3.5.',
        '3.5 is not a possible result of a single roll; the expected value is a summary of the distribution, not a prediction of one outcome.',
      ],
    },
    transfer: {
      prompt: 'Each part from a line is defective with probability 0.03, and a box holds 50 parts. What is the expected number of defective parts per box, and what does that number mean in practice?',
      reference: r`$50 \times 0.03 = 1.5$ (each part contributes $1 \times 0.03 + 0 \times 0.97$). Over many boxes the average number of defectives is 1.5; no single box contains 1.5 defectives.`,
    },
    hints: [
      'Think about what would happen on average per ticket if you played this raffle a huge number of times.',
      'Expected value = sum over prizes of (prize × probability of that prize). Then subtract the ticket price.',
      'P(win \\$100) = 1/100, P(win \\$20) = 2/100, P(nothing) = 97/100. E[prize] = 100(0.01) + 20(0.02) + 0(0.97). Compute it, then subtract \\$2.',
    ],
  },
  teach: {
    keyIdea: 'E[X] = Σ x p(x) is the probability-weighted average of the values, interpreted as the long-run average over many repetitions.',
    answer: "The expected value is the average you'd get in the long run. For a random variable with a PMF, multiply each value by its probability and add up: E[X] = Σ x p(x). Raffle example: 100 tickets at \\$2, one prize of \\$100 and two of \\$20. If you bought every ticket you'd collect \\$140, that's \\$1.40 per ticket, and the formula says the same thing: 100 × 0.01 + 20 × 0.02 = 1.40. Subtract the \\$2 price and the expected net gain is −\\$0.60 — on average you lose 60 cents per ticket. Two cautions. First, the expectation is a weighted average; averaging the prize amounts 100, 20, 20, 0 without their probabilities gives nonsense. Second, it needn't be a value you can actually get: no ticket loses exactly 60 cents, and a fair die's expected value is 3.5. It describes the average of many trials, not any single one.",
  },
  items: [
    { type: 'recall', prompt: 'Define the expected value of a discrete random variable and state how it should be interpreted.', answer: r`$E[X] = \sum_x x\,p(x)$, the sum of each value times its probability. It is the long-run average of $X$ over many independent repetitions; it need not be a possible value or the most likely value.` },
    {
      type: 'apply',
      prompt: 'X has PMF p(0) = 0.1, p(1) = 0.3, p(2) = 0.4, p(5) = 0.2. Find E[X].',
      answer: r`$E[X] = 0(0.1) + 1(0.3) + 2(0.4) + 5(0.2) = 0 + 0.3 + 0.8 + 1.0 = 2.1$.`,
      exact: '2.1',
      rubric: ['Multiplies each value by its probability.', 'Sums the four products.', 'Gives 2.1.'],
    },
    {
      type: 'apply',
      prompt: 'An insurer charges \\$300 for a policy that pays \\$10,000 with probability 0.02 and nothing otherwise. What is the insurer\'s expected profit per policy?',
      answer: r`Expected payout $= 10{,}000 \times 0.02 = \$200$, so expected profit $= 300 - 200 = \$100$ per policy.`,
      exact: '100',
      rubric: ['Computes the expected payout 0.02 × 10,000 = 200.', 'Subtracts it from the premium.', 'Gives \\$100.'],
    },
    {
      type: 'explain',
      prompt: 'Explain why the expected value of a fair die roll is 3.5 even though 3.5 can never be rolled, and what the number actually tells you.',
      answer: r`$E[X] = \sum x\,p(x) = (1 + 2 + 3 + 4 + 5 + 6)/6 = 3.5$. The expected value is the probability-weighted average of the possible values, and an average need not be one of the values averaged. It tells you the long-run average: over many rolls the mean of the results gets close to 3.5. It is not a prediction of a single roll and not the most likely result (every face is equally likely).`,
      rubric: [
        'Computes 3.5 as Σ x p(x).',
        'States that E[X] is a long-run average over many repetitions.',
        'States that E[X] need not be a possible value or the most likely value.',
      ],
      tags: ['expectation-is-most-likely-value'],
    },
    {
      type: 'predict',
      prompt: 'Before computing: a game costs \\$5 to play and pays \\$20 with probability 0.2, otherwise nothing. Do you expect to gain or lose on average? Then compute the expected net gain.',
      answer: r`Lose. $E[\text{payout}] = 20 \times 0.2 = \$4$, so expected net gain $= 4 - 5 = -\$1$ per play.`,
    },
  ],
};

export const linearityOfExpectation: ConceptSpec = {
  id: 'c-linearity-of-expectation',
  name: 'Linearity of expectation',
  definition: r`For any random variables $X$, $Y$ and constants $a$, $b$: $E[aX + b] = aE[X] + b$ and $E[X + Y] = E[X] + E[Y]$ — with no independence required. Writing a count as a sum of 0/1 indicator variables turns hard expectations into easy ones.`,
  objectives: [
    ['understand', 'State linearity of expectation and its no-independence caveat.'],
    ['apply', 'Compute expected counts via indicator variables (expected number of aces, matches, defectives).'],
    ['analyze', 'Recognise problems where linearity sidesteps computing the full PMF.'],
  ],
  misconceptions: [
    {
      tag: 'linearity-requires-independence',
      description: 'Believes E[X + Y] = E[X] + E[Y] needs X and Y to be independent.',
      remedy: 'Hat-check problem: the indicators are dependent, yet the expected number of matches is exactly 1 by linearity.',
    },
    {
      tag: 'expectation-of-product',
      description: 'Assumes E[XY] = E[X]E[Y] always (that one does require independence).',
      remedy: 'Take Y = X for a die: E[X²] = 91/6 ≈ 15.2 but (E[X])² = 12.25.',
    },
  ],
  examples: [
    { title: 'Sum of two dice', body: r`$E[X + Y] = 3.5 + 3.5 = 7$, with no need to list the 36 outcomes.`, domain: 'games' },
    { title: 'Defectives in a sample without replacement', body: r`3 parts from a lot of 10 with 4 defective: each draw is defective with probability 0.4, so $E[\text{defectives}] = 3 \times 0.4 = 1.2$ although the draws are dependent.`, domain: 'manufacturing' },
    { title: 'Hat-check problem', body: r`$n$ hats returned at random: the expected number of people who get their own hat is $n \times \tfrac1n = 1$, for every $n$.`, domain: 'puzzles' },
  ],
  script: {
    pretest: {
      prompt: 'Two fair dice are rolled. What is the expected value of their sum? Do it without listing the 36 outcomes.',
      isomorph: 'Ten fair coins are flipped. What is the expected number of heads?',
      reference: r`$E[X + Y] = E[X] + E[Y] = 3.5 + 3.5 = 7$. (Isomorph: $10 \times 0.5 = 5$.)`,
    },
    guidingQuestions: [
      { question: 'What is the expected value of the first die on its own? And of the second?', expected: '3.5 each.' },
      { question: 'Linearity says E[X + Y] = E[X] + E[Y]. Do the dice need to be independent for this to hold?', expected: 'No: linearity holds for any random variables.', probesMisconception: 'linearity-requires-independence' },
      { question: 'Test it on an extreme case: let Y be the same die as X, so the sum is 2X. Is E[2X] still 7?', expected: 'Yes: E[2X] = 2 × 3.5 = 7, even though X and Y are perfectly dependent.' },
      { question: 'Now a harder one: n people\'s hats are shuffled and handed back at random. What is the expected number of people who get their own hat? Hint: write the count as a sum of 0/1 variables.', expected: 'Let I_k = 1 if person k gets their own hat; P(I_k = 1) = 1/n; E[sum] = n × 1/n = 1.' },
      { question: 'Would you expect E[XY] = E[X]E[Y] to hold as generally? Try Y = X for a die.', expected: 'No: E[X·X] = E[X²] = 91/6 ≈ 15.2 while (3.5)² = 12.25; the product rule needs independence.', probesMisconception: 'expectation-of-product' },
    ],
    workedExample: {
      problem: 'A sample of 3 parts is drawn without replacement from a lot of 10 in which 4 are defective. What is the expected number of defective parts in the sample?',
      steps: [
        r`Define $I_k = 1$ if the $k$-th part drawn is defective, else 0, so the count is $X = I_1 + I_2 + I_3$.`,
        r`By symmetry each draw is equally likely to be any of the 10 parts, so $P(I_k = 1) = 4/10$ and $E[I_k] = 0.4$ for each $k$.`,
        r`Linearity: $E[X] = 0.4 + 0.4 + 0.4 = 1.2$.`,
        'The draws are dependent (without replacement), but linearity does not care.',
      ],
    },
    transfer: {
      prompt: 'A rideshare driver earns \\$3 per ride plus \\$0.50 per mile. On a typical day the expected number of rides is 20 and the expected mileage is 150. What are the expected daily earnings? Do you need to know whether rides and miles are independent?',
      reference: r`$E[3R + 0.5M] = 3 \times 20 + 0.5 \times 150 = 60 + 75 = \$135$. Independence is not needed; linearity holds regardless.`,
    },
    hints: [
      "Rather than working out the distribution of the sum, think about each die separately.",
      'Use E[X + Y] = E[X] + E[Y]; you already know the expected value of one die.',
      'E[first die] = 3.5, and the second die has the same expectation. Linearity of expectation lets you add them — write the sum.',
    ],
  },
  teach: {
    keyIdea: 'E[X + Y] = E[X] + E[Y] and E[aX + b] = aE[X] + b hold for any random variables, independent or not; indicator variables exploit this to compute expected counts.',
    answer: "Linearity of expectation says the expected value of a sum is the sum of the expected values — always, whether or not the variables are independent. Two dice: each has expectation 3.5, so the sum has expectation 7; no need to list 36 outcomes. The power move is indicator variables: to find the expected number of things that happen, write the count as a sum of 0/1 variables, one per thing. Hat-check puzzle: n people's hats are returned at random; each person gets their own hat with probability 1/n, so the expected number of matches is n × 1/n = 1, no matter how large n is, even though whether one person gets their hat affects whether another does. The caveat is that the same trick does NOT work for products: E[XY] = E[X]E[Y] needs independence. For a die, E[X·X] = E[X²] ≈ 15.2, not 3.5² = 12.25.",
  },
  items: [
    { type: 'recall', prompt: r`State linearity of expectation and say what condition on $X$ and $Y$ it requires.`, answer: r`$E[aX + bY + c] = aE[X] + bE[Y] + c$ for any random variables $X$, $Y$ and constants $a, b, c$. It requires no condition at all — in particular, not independence.` },
    {
      type: 'apply',
      prompt: "Twenty people each answer a yes/no question, saying 'yes' with probability 0.3. What is the expected number of 'yes' answers? Would the answer change if their answers were dependent (but each person still says 'yes' with probability 0.3)?",
      answer: r`Let $I_k = 1$ if person $k$ says yes. $E[\sum I_k] = 20 \times 0.3 = 6$. Dependence would not change it: linearity does not require independence.`,
      exact: '6',
      rubric: ['Gives the expected count 20 × 0.3 = 6.', 'States that dependence does not change the expectation.', 'Justifies via linearity / indicator variables.'],
    },
    {
      type: 'apply',
      prompt: 'Five cards are dealt from a well-shuffled standard deck. What is the expected number of aces? (Use an indicator for each of the five positions.)',
      answer: r`Let $I_k = 1$ if the $k$-th card is an ace; by symmetry $P(I_k = 1) = 4/52$. $E[\text{aces}] = 5 \times 4/52 = 20/52 = 5/13 \approx 0.385$.`,
      exact: '5/13',
      rubric: ['Defines an indicator per card position with P = 4/52.', 'Adds five expectations by linearity.', 'Gives 5/13 ≈ 0.385.'],
    },
    {
      type: 'explain',
      prompt: r`Explain how indicator variables and linearity give the expected number of people who receive their own hat when $n$ hats are returned at random, and why the dependence between people does not matter.`,
      answer: r`Let $I_k = 1$ if person $k$ receives their own hat and 0 otherwise; the number of matches is $X = I_1 + \cdots + I_n$. Each person is equally likely to receive any of the $n$ hats, so $P(I_k = 1) = 1/n$ and $E[I_k] = 1/n$. By linearity, $E[X] = \sum_k E[I_k] = n \times 1/n = 1$. The indicators are dependent (if $n - 1$ people have their own hats, so does the last), but linearity of expectation holds for any random variables, so the dependence is irrelevant.`,
      rubric: [
        'Defines I_k = 1 if person k gets their own hat.',
        'States P(I_k = 1) = 1/n.',
        'Concludes E[X] = n × 1/n = 1 by linearity.',
        'States that linearity holds without independence.',
      ],
      tags: ['linearity-requires-independence'],
    },
    {
      type: 'discriminate',
      prompt: r`Contrast $E[X + Y] = E[X] + E[Y]$ with $E[XY] = E[X]\,E[Y]$: which always holds and which needs an assumption? Give an example where the product rule fails.`,
      answer: r`The sum rule always holds (linearity of expectation). The product rule requires independence (more precisely, zero covariance). Counterexample: let $X$ be a fair die and $Y = X$. Then $E[XY] = E[X^2] = (1 + 4 + 9 + 16 + 25 + 36)/6 = 91/6 \approx 15.17$, but $E[X]E[Y] = 3.5^2 = 12.25$.`,
      rubric: [
        'States that the sum rule holds for all random variables.',
        'States that the product rule requires independence (or zero covariance).',
        'Gives a valid counterexample with correct numbers (e.g. Y = X for a die: 91/6 ≠ 12.25).',
      ],
      tags: ['expectation-of-product'],
    },
  ],
};

export const variance: ConceptSpec = {
  id: 'c-variance',
  name: 'Variance and standard deviation',
  definition: r`The variance $\mathrm{Var}(X) = E[(X - \mu)^2] = E[X^2] - \mu^2$ is the average squared distance of $X$ from its mean $\mu$; the standard deviation $\sigma = \sqrt{\mathrm{Var}(X)}$ is in the units of $X$. For constants, $\mathrm{Var}(aX + b) = a^2\,\mathrm{Var}(X)$.`,
  objectives: [
    ['apply', 'Compute variance and standard deviation from a PMF, by the definition and by the shortcut formula.'],
    ['understand', 'Interpret the SD as typical spread and explain why deviations are squared.'],
    ['apply', r`Use $\mathrm{Var}(aX + b) = a^2\,\mathrm{Var}(X)$ for shifted and rescaled variables.`],
  ],
  misconceptions: [
    {
      tag: 'variance-changes-under-shift',
      description: 'Thinks adding a constant changes the variance, or that scaling by a multiplies the variance by a rather than a².',
      remedy: 'Shift every value by 10 and recompute: deviations from the mean are unchanged. Double every value: deviations double, squared deviations quadruple.',
    },
    {
      tag: 'sd-is-average-absolute-deviation',
      description: 'Believes the standard deviation is the average absolute distance from the mean.',
      remedy: 'Compute both for a simple PMF (e.g. values 0 and 10 with p = 0.9, 0.1): mean absolute deviation 1.8, SD 3. They differ.',
    },
  ],
  examples: [
    { title: 'Fair die', body: r`$\mu = 3.5$, $E[X^2] = 91/6$, $\mathrm{Var}(X) = 91/6 - 49/4 = 35/12 \approx 2.92$, $\sigma \approx 1.71$.`, domain: 'games' },
    { title: 'Temperature units', body: r`Readings in °C have SD 2. In °F ($F = 1.8C + 32$) the SD is $1.8 \times 2 = 3.6$ and the variance is $12.96$; the +32 changes nothing.`, domain: 'weather' },
    { title: 'Part lengths', body: r`Length $X$ has mean 50 mm and SD 0.4 mm. A gauge reports $Y = 2X - 60$: $E[Y] = 40$, $\mathrm{Var}(Y) = 4 \times 0.16 = 0.64$, SD 0.8.`, domain: 'manufacturing' },
  ],
  script: {
    pretest: {
      prompt: 'X takes the values 1, 2, 3 with probabilities 0.2, 0.5, 0.3. Find E[X], Var(X) and the standard deviation.',
      isomorph: 'Y takes the values 0 and 10 with probability 0.5 each. Find Var(Y) and the standard deviation.',
      reference: r`$\mu = 0.2 + 1.0 + 0.9 = 2.1$; $E[X^2] = 0.2 + 2.0 + 2.7 = 4.9$; $\mathrm{Var}(X) = 4.9 - 2.1^2 = 0.49$; $\sigma = 0.7$. (Isomorph: $\mu = 5$, $\mathrm{Var} = 25$, $\sigma = 5$.)`,
    },
    guidingQuestions: [
      { question: 'What is the mean? Now, how far is each value from the mean?', expected: 'μ = 2.1; deviations −1.1, −0.1, +0.9.' },
      { question: 'If we average the deviations, weighted by probability, what do we get — and why is that useless as a measure of spread?', expected: '0.2(−1.1) + 0.5(−0.1) + 0.3(0.9) = 0: the weighted deviations always cancel, so the plain average deviation is always zero.' },
      { question: 'So we square them first. Compute the weighted average of the squared deviations.', expected: '0.2(1.21) + 0.5(0.01) + 0.3(0.81) = 0.242 + 0.005 + 0.243 = 0.49.' },
      { question: r`Check with the shortcut $E[X^2] - \mu^2$. And what is the standard deviation?`, expected: 'E[X²] = 4.9; 4.9 − 4.41 = 0.49; σ = 0.7, in the same units as X.', probesMisconception: 'sd-is-average-absolute-deviation' },
      { question: 'If every value were increased by 100, what would happen to the variance? If every value were doubled?', expected: 'Unchanged (deviations are the same); multiplied by 4 (deviations double, squares quadruple).', probesMisconception: 'variance-changes-under-shift' },
    ],
    workedExample: {
      problem: 'X is a fair die roll. Find Var(X) and the standard deviation.',
      steps: [
        r`$\mu = 3.5$.`,
        r`$E[X^2] = (1 + 4 + 9 + 16 + 25 + 36)/6 = 91/6$.`,
        r`$\mathrm{Var}(X) = 91/6 - (7/2)^2 = 91/6 - 49/4 = (182 - 147)/12 = 35/12 \approx 2.917$.`,
        r`$\sigma = \sqrt{35/12} \approx 1.71$: a typical roll is about 1.7 away from 3.5.`,
      ],
    },
    transfer: {
      prompt: 'A temperature sensor reports in °C with standard deviation 2 °C. The readings are converted to °F by F = 1.8C + 32. What are the SD and the variance of the readings in °F?',
      reference: r`SD $= 1.8 \times 2 = 3.6$ °F; variance $= 3.6^2 = 12.96$ (equivalently $1.8^2 \times 4$). The +32 shift has no effect on spread.`,
    },
    hints: [
      'Variance asks: on average, how far (squared) is X from its mean? Start with the mean.',
      'Either compute Σ (x − μ)² p(x), or use the shortcut E[X²] − μ², where E[X²] = Σ x² p(x).',
      'μ = 2.1. E[X²] = 1²(0.2) + 2²(0.5) + 3²(0.3) = 4.9. Now subtract μ², and take the square root for the SD.',
    ],
  },
  teach: {
    keyIdea: 'Var(X) = E[(X − μ)²] = E[X²] − μ² measures average squared deviation from the mean; SD is its square root, and Var(aX + b) = a² Var(X).',
    answer: "The expected value tells you the centre of a distribution; the variance tells you how spread out it is. Take each possible value, measure its distance from the mean, square it, and average with the probabilities as weights: Var(X) = E[(X − μ)²]. We square because the plain deviations always cancel to zero. A handy shortcut is Var(X) = E[X²] − μ². Fair die: μ = 3.5, E[X²] = 91/6, so Var = 91/6 − 12.25 ≈ 2.92. Because we squared, the units are squared too, so we take the square root to get the standard deviation, about 1.71 — a typical roll is roughly 1.7 away from 3.5. Two rules worth remembering: adding a constant doesn't change the spread, so Var(X + b) = Var(X); multiplying by a scales deviations by a and the variance by a², so Var(aX) = a² Var(X) and SD(aX) = |a| SD(X).",
  },
  items: [
    { type: 'recall', prompt: r`Give the two formulas for $\mathrm{Var}(X)$ and state how the standard deviation relates to it.`, answer: r`$\mathrm{Var}(X) = E[(X - \mu)^2] = \sum_x (x - \mu)^2 p(x)$, and equivalently $\mathrm{Var}(X) = E[X^2] - \mu^2$. The standard deviation is $\sigma = \sqrt{\mathrm{Var}(X)}$, in the same units as $X$.` },
    {
      type: 'apply',
      prompt: 'X takes the values 0, 1, 4 with probabilities 0.5, 0.25, 0.25. Find Var(X).',
      answer: r`$\mu = 0(0.5) + 1(0.25) + 4(0.25) = 1.25$. $E[X^2] = 0 + 1(0.25) + 16(0.25) = 4.25$. $\mathrm{Var}(X) = 4.25 - 1.25^2 = 4.25 - 1.5625 = 2.6875$.`,
      exact: '2.6875',
      rubric: ['Computes μ = 1.25.', 'Computes E[X²] = 4.25 (or the squared deviations directly).', 'Gives Var(X) = 2.6875 (= 43/16).'],
    },
    {
      type: 'apply',
      prompt: 'A part\'s length X has mean 50.0 mm and standard deviation 0.4 mm. A gauge reports Y = 2X − 60. Find E[Y], Var(Y) and SD(Y).',
      answer: r`$E[Y] = 2(50) - 60 = 40$. $\mathrm{Var}(Y) = 2^2 \times 0.4^2 = 4 \times 0.16 = 0.64$. $\mathrm{SD}(Y) = 0.8$.`,
      exact: 'E[Y] = 40; Var(Y) = 0.64; SD(Y) = 0.8',
      rubric: ['Gives E[Y] = 40 by linearity.', 'Uses Var(aX + b) = a² Var(X) to get 0.64.', 'Gives SD(Y) = 0.8.'],
    },
    {
      type: 'explain',
      prompt: 'Explain why variance uses squared deviations rather than the plain average deviation, and why the standard deviation is often easier to interpret than the variance.',
      answer: r`The plain (signed) deviations $x - \mu$ average to zero for every distribution, because values above and below the mean cancel exactly — so their average says nothing about spread. Squaring makes every deviation non-negative (and weights large deviations more heavily), so the average squared deviation is a genuine measure of spread. But squaring also squares the units (mm become mm²), which is hard to interpret; taking the square root gives the standard deviation, which is back in the original units and can be read as a typical distance from the mean.`,
      rubric: [
        'States that signed deviations average to zero.',
        'States that squaring makes deviations non-negative (and/or penalises large deviations more).',
        'States that the SD is in the same units as X, which makes it interpretable as a typical distance from the mean.',
      ],
    },
    { type: 'cloze', prompt: r`$\mathrm{Var}(aX + b) = $ ____ $\cdot\,\mathrm{Var}(X)$; adding the constant $b$ ____ the variance.`, answer: 'a²; does not change' },
    {
      type: 'predict',
      prompt: 'Before computing: two random variables both have mean 5. A takes the values 4 and 6 with equal probability; B takes 0 and 10 with equal probability. Which has the larger standard deviation, and by what factor? Then verify.',
      answer: r`B, by a factor of 5. A: deviations $\pm 1$, $\mathrm{Var} = 1$, SD 1. B: deviations $\pm 5$, $\mathrm{Var} = 25$, SD 5.`,
    },
  ],
};

export const bernoulli: ConceptSpec = {
  id: 'c-bernoulli',
  name: 'Bernoulli trials',
  definition: r`A Bernoulli trial is a single experiment with two outcomes: 'success' (coded 1) with probability $p$ and 'failure' (coded 0) with probability $1 - p$. If $X \sim \mathrm{Bernoulli}(p)$ then $E[X] = p$ and $\mathrm{Var}(X) = p(1 - p)$.`,
  objectives: [
    ['remember', r`Define $\mathrm{Bernoulli}(p)$ and state its mean and variance.`],
    ['apply', r`Model yes/no situations as Bernoulli trials, identify $p$, and compute mean and variance.`],
    ['understand', r`Explain why the variance $p(1-p)$ is largest at $p = 1/2$.`],
  ],
  misconceptions: [
    {
      tag: 'success-means-desirable',
      description: "Thinks 'success' must be a good outcome, so refuses to code 'defective' or 'rain' as 1.",
      remedy: "'Success' is just the outcome we are counting; for a defect count, a defective part is the success.",
    },
    {
      tag: 'bernoulli-variance-is-p',
      description: 'Assumes Var(X) = p for a Bernoulli variable.',
      remedy: 'Compute E[X²] − (E[X])² explicitly: since X² = X, E[X²] = p and Var = p − p².',
    },
  ],
  examples: [
    { title: 'Defective part', body: r`$X = 1$ if a part is defective, $p = 0.1$: $E[X] = 0.1$, $\mathrm{Var}(X) = 0.1 \times 0.9 = 0.09$.`, domain: 'manufacturing' },
    { title: 'Treatment response', body: r`A patient responds with probability 0.6: $E[X] = 0.6$, $\mathrm{Var}(X) = 0.24$, SD $\approx 0.49$.`, domain: 'medicine' },
    { title: 'Free throw', body: r`Made with probability 0.8: $E[X] = 0.8$, $\mathrm{Var}(X) = 0.16$.`, domain: 'sports' },
  ],
  script: {
    pretest: {
      prompt: 'A part is defective with probability 0.1. Let X = 1 if the part is defective and 0 otherwise. Find E[X] and Var(X).',
      isomorph: 'A basketball player makes a free throw with probability 0.8. Let X = 1 if the throw is made. Find E[X] and Var(X).',
      reference: r`$E[X] = 0.1$, $\mathrm{Var}(X) = 0.1 \times 0.9 = 0.09$. (Isomorph: $0.8$ and $0.16$.)`,
    },
    guidingQuestions: [
      { question: 'What values can X take, and with what probabilities? Is it odd to call a defective part a "success"?', expected: '1 with probability 0.1, 0 with probability 0.9. Not odd: success just means the outcome being counted.', probesMisconception: 'success-means-desirable' },
      { question: 'So what is E[X]?', expected: '1(0.1) + 0(0.9) = 0.1 — the probability itself.' },
      { question: r`What is $E[X^2]$? (What are $1^2$ and $0^2$?)`, expected: 'Also 0.1, because X² = X for a 0/1 variable.' },
      { question: r`So $\mathrm{Var}(X) = E[X^2] - (E[X])^2 = $ ?`, expected: '0.1 − 0.01 = 0.09 = p(1 − p), not p.', probesMisconception: 'bernoulli-variance-is-p' },
      { question: r`For which $p$ is $p(1 - p)$ largest? What does that say about uncertainty?`, expected: 'p = 1/2 (value 1/4): a 50/50 trial is the most unpredictable; p near 0 or 1 is nearly certain.' },
    ],
    workedExample: {
      problem: 'A patient responds to a treatment with probability 0.6. Define the Bernoulli random variable and compute its mean, variance and standard deviation.',
      steps: [
        r`$X = 1$ if the patient responds (probability 0.6), $X = 0$ otherwise (0.4).`,
        r`$E[X] = 0.6$.`,
        r`$\mathrm{Var}(X) = 0.6 \times 0.4 = 0.24$, so $\sigma = \sqrt{0.24} \approx 0.49$.`,
      ],
    },
    transfer: {
      prompt: 'Rain tomorrow has probability 0.3. Let R = 1 if it rains. What are E[R] and Var(R)? Which of p = 0.3 and p = 0.5 gives the more unpredictable day, judged by variance?',
      reference: r`$E[R] = 0.3$, $\mathrm{Var}(R) = 0.3 \times 0.7 = 0.21$. $p = 0.5$ gives variance 0.25, the maximum, so it is the more unpredictable.`,
    },
    hints: [
      'Write out the PMF: there are only two values.',
      'Use E[X] = Σ x p(x) and Var(X) = E[X²] − (E[X])²; note that 1² = 1 and 0² = 0.',
      'E[X] = 1(0.1) + 0(0.9) = 0.1; E[X²] = 1²(0.1) + 0²(0.9) = 0.1. Now subtract (0.1)² to get the variance.',
    ],
  },
  teach: {
    keyIdea: 'a Bernoulli(p) variable is 1 with probability p and 0 otherwise, with mean p and variance p(1 − p).',
    answer: "A Bernoulli trial is the simplest random experiment: something either happens or it doesn't. We code it as a random variable X that is 1 with probability p and 0 with probability 1 − p. The '1' outcome is called a success, but that's just a label for the thing we're counting — for a quality inspector, a defective part is the 'success'. The mean is easy: E[X] = 1·p + 0·(1−p) = p. For the variance, note X² = X (since 1² = 1 and 0² = 0), so E[X²] = p too, and Var(X) = p − p² = p(1 − p). Example: a part is defective with probability 0.1: mean 0.1, variance 0.09. The variance is largest when p = 1/2 — a coin flip is maximally unpredictable — and shrinks to zero as p approaches 0 or 1. Bernoulli trials are the building blocks of the binomial and geometric distributions.",
  },
  items: [
    { type: 'recall', prompt: r`Define a $\mathrm{Bernoulli}(p)$ random variable and give its mean and variance.`, answer: r`$X$ takes the value 1 ('success') with probability $p$ and 0 ('failure') with probability $1 - p$. $E[X] = p$ and $\mathrm{Var}(X) = p(1 - p)$.` },
    {
      type: 'apply',
      prompt: 'A biased coin lands heads with probability 0.35. Let X = 1 if it lands heads. Find E[X] and Var(X).',
      answer: r`$E[X] = 0.35$; $\mathrm{Var}(X) = 0.35 \times 0.65 = 0.2275$.`,
      exact: '0.35; 0.2275',
      rubric: ['Gives E[X] = 0.35.', 'Uses p(1 − p).', 'Gives Var(X) = 0.2275.'],
    },
    {
      type: 'explain',
      prompt: r`Show, from the definition of variance, that a $\mathrm{Bernoulli}(p)$ variable has variance $p(1 - p)$, and explain why the variance is largest when $p = 1/2$.`,
      answer: r`$E[X] = 1 \cdot p + 0 \cdot (1 - p) = p$. Since $X$ is 0 or 1, $X^2 = X$, so $E[X^2] = p$. Then $\mathrm{Var}(X) = E[X^2] - (E[X])^2 = p - p^2 = p(1 - p)$. The function $p(1 - p)$ is a downward parabola with roots at 0 and 1, so it peaks at $p = 1/2$ with value $1/4$: a 50/50 trial is the most uncertain, while trials with $p$ near 0 or 1 are almost deterministic and have variance near 0.`,
      rubric: [
        'States E[X] = p.',
        'States E[X²] = p because X² = X.',
        'Derives Var(X) = p − p² = p(1 − p).',
        'Explains that p(1 − p) is maximised at p = 1/2 (value 1/4), the point of maximal uncertainty.',
      ],
      tags: ['bernoulli-variance-is-p'],
    },
    { type: 'cloze', prompt: "For a Bernoulli trial the outcome coded 1 is called a ____, but it need not be a good outcome — for a quality inspection counting defects the 'success' would be ____.", answer: 'success; a defective part' },
    {
      type: 'apply',
      bloom: 'understand',
      prompt: 'For each situation, say whether it can be modelled as a single Bernoulli trial and, if so, identify p: (a) a patient either recovers (probability 0.7) or does not; (b) the number of goals scored in a football match; (c) a fair die is rolled and we record whether it shows a 6.',
      answer: '(a) Yes: X = 1 if the patient recovers, p = 0.7. (b) No: the number of goals has many possible values, not two. (c) Yes: X = 1 if a six shows, p = 1/6.',
      exact: '(a) yes, p = 0.7; (b) no; (c) yes, p = 1/6',
      rubric: ['Identifies (a) as Bernoulli with p = 0.7.', 'Rejects (b) because it has more than two outcomes.', 'Identifies (c) as Bernoulli with p = 1/6.'],
    },
  ],
};

export const binomial: ConceptSpec = {
  id: 'c-binomial',
  name: 'The binomial distribution',
  definition: r`The number of successes $X$ in $n$ independent Bernoulli trials with the same success probability $p$ is binomial: $P(X = k) = \binom{n}{k} p^k (1-p)^{n-k}$ for $k = 0, \dots, n$, with $E[X] = np$ and $\mathrm{Var}(X) = np(1-p)$.`,
  objectives: [
    ['understand', 'Derive the binomial PMF as (number of sequences) × (probability of one sequence).'],
    ['apply', "Compute binomial probabilities, including 'at least' probabilities, and the mean and variance."],
    ['analyze', 'Check the binomial conditions (fixed n, independent trials, constant p) and recognise when they fail.'],
  ],
  misconceptions: [
    {
      tag: 'forgets-binomial-coefficient',
      description: 'Uses p^k (1 − p)^(n−k) alone — the probability of one particular sequence — for "exactly k successes".',
      remedy: 'Ask how many different sequences have exactly k successes, and whether they all have the same probability.',
    },
    {
      tag: 'binomial-without-independence',
      description: 'Applies the binomial to draws without replacement from a small population, where p changes between draws.',
      remedy: 'Ask whether the success probability on the second draw depends on the first; if so the trials are not independent Bernoulli(p).',
    },
  ],
  examples: [
    { title: 'Defectives in a sample', body: r`Each of 5 parts is defective with probability 0.1: $P(X = 1) = \binom{5}{1}(0.1)(0.9)^4 \approx 0.328$; $P(X \ge 1) = 1 - 0.9^5 \approx 0.410$.`, domain: 'manufacturing' },
    { title: 'Responders', body: r`8 patients each respond with probability 0.6: $P(X = 5) = \binom{8}{5}(0.6)^5(0.4)^3 \approx 0.279$; $E[X] = 4.8$.`, domain: 'medicine' },
    { title: 'Rainy days', body: r`7 days with independent 20% rain chance: $P(\text{exactly 2}) = \binom{7}{2}(0.2)^2(0.8)^5 \approx 0.275$; $E = 1.4$, $\mathrm{Var} = 1.12$.`, domain: 'weather' },
  ],
  script: {
    pretest: {
      prompt: 'A part is defective with probability 0.1, independently of other parts. In a sample of 5 parts, what is the probability of exactly 1 defective? Of at least 1 defective?',
      isomorph: 'A player makes 80% of free throws, independently. In 4 attempts, what is the probability of exactly 3 made? Of at least 3 made?',
      reference: r`$P(X = 1) = \binom{5}{1}(0.1)(0.9)^4 = 5 \times 0.1 \times 0.6561 \approx 0.328$; $P(X \ge 1) = 1 - 0.9^5 \approx 0.410$. (Isomorph: $4 \times 0.8^3 \times 0.2 = 0.4096$; at least 3: $0.4096 + 0.8^4 = 0.8192$.)`,
    },
    guidingQuestions: [
      { question: 'What is the probability of the specific sequence D G G G G (defective first, then four good)?', expected: '0.1 × 0.9⁴ ≈ 0.0656, multiplying because the parts are independent.' },
      { question: 'How many sequences of 5 parts have exactly one D? Do they all have the same probability?', expected: 'Five (the D can be in any of 5 positions), and yes — each is 0.1 × 0.9⁴.', probesMisconception: 'forgets-binomial-coefficient' },
      { question: 'So what is P(exactly 1 defective)?', expected: '5 × 0.0656 ≈ 0.328.' },
      { question: r`Write the general formula for exactly $k$ successes in $n$ trials, and say where each factor comes from.`, expected: 'C(n,k) p^k (1−p)^{n−k}: C(n,k) counts the sequences, p^k (1−p)^{n−k} is the probability of each.' },
      { question: 'Why would this formula be wrong for 5 parts drawn without replacement from a lot of 20 containing 2 defectives?', expected: 'The defect probability changes after each draw, so the trials are not independent with constant p.', probesMisconception: 'binomial-without-independence' },
    ],
    workedExample: {
      problem: 'Eight patients each respond to a drug with probability 0.6, independently. What is the probability that exactly 5 respond? What is the expected number of responders?',
      steps: [
        r`$\binom{8}{5} = 56$ sequences with exactly 5 responders.`,
        r`Each has probability $0.6^5 \times 0.4^3 = 0.07776 \times 0.064 \approx 0.004977$.`,
        r`$P(X = 5) = 56 \times 0.004977 \approx 0.279$.`,
        r`$E[X] = np = 8 \times 0.6 = 4.8$.`,
      ],
    },
    transfer: {
      prompt: 'Each day of a 7-day week has an independent 20% chance of rain. What is the probability of exactly 2 rainy days? What are the expected number of rainy days and its variance?',
      reference: r`$\binom{7}{2}(0.2)^2(0.8)^5 = 21 \times 0.04 \times 0.32768 \approx 0.275$. $E = 7 \times 0.2 = 1.4$; $\mathrm{Var} = 7 \times 0.2 \times 0.8 = 1.12$.`,
    },
    hints: [
      "Start with one particular arrangement, e.g. the defective part is the first one. What's the probability of that exact sequence?",
      "Multiply the probability of one sequence by the number of sequences with exactly one defective; for 'at least one' use the complement.",
      'P(D G G G G) = 0.1 × 0.9⁴ ≈ 0.0656. There are C(5,1) = 5 positions for the D, so multiply. For at least one: P(none) = 0.9⁵, then subtract from 1.',
    ],
  },
  teach: {
    keyIdea: 'the number of successes in n independent trials with success probability p has P(X = k) = C(n,k) p^k (1−p)^(n−k), mean np and variance np(1−p).',
    answer: "Repeat a Bernoulli trial n times, independently, with the same success probability p, and count the successes. That count is binomial. Say parts are defective with probability 0.1 and we inspect 5. What's P(exactly one defective)? One specific pattern like D G G G G has probability 0.1 × 0.9⁴ ≈ 0.066, but the defective could be in any of 5 positions, and each pattern has the same probability, so P = 5 × 0.066 ≈ 0.33. In general the number of patterns with k successes is C(n,k), giving P(X = k) = C(n,k) p^k (1−p)^(n−k). The mean is np (here 0.5 defectives) and the variance np(1−p). The classic slip is forgetting the C(n,k) — that gives you the probability of one specific pattern, not of 'exactly k'. And check the conditions: fixed n, independent trials, constant p. Drawing without replacement from a small lot breaks constant p, and then the binomial is only an approximation.",
  },
  items: [
    { type: 'recall', prompt: 'State the binomial PMF, its mean and variance, and the three conditions for a binomial model.', answer: r`$P(X = k) = \binom{n}{k} p^k (1-p)^{n-k}$, $k = 0, \dots, n$; $E[X] = np$, $\mathrm{Var}(X) = np(1-p)$. Conditions: a fixed number $n$ of trials, trials independent, and the same success probability $p$ on every trial.` },
    {
      type: 'apply',
      prompt: 'A multiple-choice quiz has 6 questions, each with 4 options; a student guesses every answer at random. What is the probability of exactly 2 correct answers?',
      answer: r`$X \sim \mathrm{Bin}(6, 0.25)$. $P(X = 2) = \binom{6}{2}(0.25)^2(0.75)^4 = 15 \times 0.0625 \times 0.31640625 \approx 0.2966$.`,
      exact: '0.2966',
      notes: 'Accept 0.30 or 0.297.',
      rubric: ['Identifies n = 6, p = 0.25.', 'Uses C(6,2) = 15 with (0.25)²(0.75)⁴.', 'Gives ≈ 0.297.'],
    },
    {
      type: 'apply',
      prompt: 'A machine produces parts that are independently defective with probability 0.05. In a batch of 20, what are the expected number of defectives and the variance? What is the probability of no defectives?',
      answer: r`$E[X] = 20 \times 0.05 = 1$; $\mathrm{Var}(X) = 20 \times 0.05 \times 0.95 = 0.95$; $P(X = 0) = 0.95^{20} \approx 0.358$.`,
      exact: 'E = 1; Var = 0.95; P(0) ≈ 0.358',
      rubric: ['Gives E[X] = 1.', 'Gives Var(X) = 0.95.', 'Gives P(X = 0) = 0.95^20 ≈ 0.36.'],
    },
    {
      type: 'explain',
      prompt: r`Explain where each factor in $\binom{n}{k}p^k(1-p)^{n-k}$ comes from.`,
      answer: r`Fix one particular sequence of $n$ trials with successes in $k$ specified positions. Because the trials are independent, its probability is the product of $k$ factors of $p$ and $n - k$ factors of $1 - p$: $p^k(1-p)^{n-k}$. Every sequence with exactly $k$ successes has this same probability, and there are $\binom{n}{k}$ of them (choose which $k$ of the $n$ positions hold the successes). These sequences are disjoint events, so their probabilities add: $\binom{n}{k}p^k(1-p)^{n-k}$.`,
      rubric: [
        'Explains p^k as the probability of the k successes in a specific sequence.',
        'Explains (1−p)^(n−k) as the failures, multiplied because trials are independent.',
        'Explains C(n,k) as the number of sequences (positions of the successes).',
        'States that all such sequences have equal probability and are added (disjoint).',
      ],
      tags: ['forgets-binomial-coefficient'],
    },
    {
      type: 'discriminate',
      prompt: 'A quality engineer samples 5 parts without replacement from a lot of 12 that contains 3 defectives. Explain why the number of defectives in the sample is not binomial, and describe what changes if the lot has 12,000 parts with 3,000 defectives.',
      answer: r`Without replacement, the probability that a given draw is defective depends on earlier draws (3/12 at first, then 2/11 or 3/11), so the trials are neither independent nor of constant $p$; the count follows the hypergeometric distribution, computed by counting ($\binom{3}{k}\binom{9}{5-k}/\binom{12}{5}$) or by sequential conditional probabilities. With 12,000 parts and 3,000 defectives, removing a few parts barely changes the proportion (0.25), so the draws are almost independent with $p \approx 0.25$ and $\mathrm{Bin}(5, 0.25)$ is an excellent approximation.`,
      rubric: [
        'Identifies that without replacement p changes from draw to draw / draws are dependent.',
        'Names the correct model or method (hypergeometric, or counting/sequential conditional probabilities).',
        'States that with a huge lot the dependence is negligible so Bin(5, 0.25) is a good approximation.',
      ],
      tags: ['binomial-without-independence'],
    },
  ],
};

export const geometric: ConceptSpec = {
  id: 'c-geometric',
  name: 'The geometric distribution',
  definition: r`In repeated independent $\mathrm{Bernoulli}(p)$ trials, the number of trials $X$ up to and including the first success is geometric: $P(X = k) = (1-p)^{k-1}p$ for $k = 1, 2, \dots$, with $E[X] = 1/p$ and $P(X > k) = (1-p)^k$.`,
  objectives: [
    ['understand', 'Derive the PMF from the required sequence of failures followed by a success.'],
    ['apply', r`Compute $P(X = k)$, $P(X > k)$ and the expected waiting time.`],
    ['analyze', 'Contrast the geometric (waiting time for the first success) with the binomial (count of successes in a fixed number of trials).'],
  ],
  misconceptions: [
    {
      tag: 'geometric-vs-binomial',
      description: "Confuses 'the first success is on trial k' with 'exactly one success in k trials', inserting a binomial coefficient.",
      remedy: 'Compare the two events: the geometric event fixes the success at position k and the first k−1 as failures — only one ordering.',
    },
    {
      tag: 'expected-wait-is-most-likely',
      description: 'Thinks the most likely waiting time is 1/p; in fact the mode is always k = 1.',
      remedy: 'Compute P(X = 1) = 1/6 and P(X = 6) = (5/6)^5/6 ≈ 0.067 for a die: the first trial is always the most likely.',
    },
  ],
  examples: [
    { title: 'First six', body: r`Rolls until the first six: $P(X = 3) = (5/6)^2(1/6) = 25/216 \approx 0.116$; $E[X] = 6$.`, domain: 'games' },
    { title: 'First defective', body: r`Parts inspected until the first defective ($p = 0.2$): $P(X = 4) = 0.8^3 \times 0.2 = 0.1024$; $E[X] = 5$.`, domain: 'manufacturing' },
    { title: 'First positive screen', body: r`Patients screened until the first positive ($p = 0.05$): $P(X > 20) = 0.95^{20} \approx 0.358$; $E[X] = 20$.`, domain: 'medicine' },
  ],
  script: {
    pretest: {
      prompt: 'A fair die is rolled repeatedly until the first six appears. What is the probability that this takes exactly 3 rolls? What is the expected number of rolls?',
      isomorph: 'Parts are inspected one by one until the first defective is found; each part is defective with probability 0.2, independently. What is the probability that the first defective is the 4th part? What is the expected number of parts inspected?',
      reference: r`$P(X = 3) = (5/6)^2(1/6) = 25/216 \approx 0.116$; $E[X] = 1/p = 6$. (Isomorph: $0.8^3 \times 0.2 = 0.1024$; $E[X] = 5$.)`,
    },
    guidingQuestions: [
      { question: 'For the first six to be on roll 3, what must happen on rolls 1, 2 and 3?', expected: 'Not six, not six, six.' },
      { question: 'What is the probability of that sequence?', expected: '(5/6)(5/6)(1/6) = 25/216, multiplying by independence.' },
      { question: "Why isn't there a binomial coefficient here, as there was for 'exactly one six in 3 rolls'?", expected: 'Only one ordering is possible: the success must be last and everything before it a failure.', probesMisconception: 'geometric-vs-binomial' },
      { question: 'Which value of k is most likely? Is it 6, the expected value?', expected: 'k = 1 (probability 1/6) is the most likely; probabilities decrease geometrically. The mean 6 is pulled up by the long tail.', probesMisconception: 'expected-wait-is-most-likely' },
      { question: 'What is P(X > 3)? Is there a quick way to see it?', expected: 'All three rolls fail: (5/6)³ ≈ 0.579.' },
    ],
    workedExample: {
      problem: 'Patients are screened one at a time until the first positive result; each is positive with probability 0.05, independently. Find P(the first positive is the 10th patient), P(more than 20 patients are screened without a positive), and the expected number screened up to and including the first positive.',
      steps: [
        r`$P(X = 10) = 0.95^9 \times 0.05 \approx 0.630 \times 0.05 \approx 0.0315$.`,
        r`$P(X > 20) = 0.95^{20} \approx 0.358$ (the first 20 are all negative).`,
        r`$E[X] = 1/0.05 = 20$.`,
      ],
    },
    transfer: {
      prompt: 'A player makes free throws with probability 0.7, independently. What is the probability that the first miss occurs on the 4th throw? What is the expected number of throws up to and including the first miss?',
      reference: r`Here 'success' = miss, $p = 0.3$. $P(X = 4) = 0.7^3 \times 0.3 = 0.1029$; $E[X] = 1/0.3 \approx 3.33$.`,
    },
    hints: [
      'Write out what the sequence of results must look like for the first six to happen on roll 3.',
      "Multiply the probabilities of the required results on each roll (they're independent). The expected waiting time is 1/p.",
      'Rolls 1 and 2 must not be six (probability 5/6 each), roll 3 must be a six (1/6). Multiply the three factors; then use E[X] = 1/p with p = 1/6.',
    ],
  },
  teach: {
    keyIdea: 'the number of trials up to the first success has P(X = k) = (1−p)^(k−1) p and mean 1/p; there is no binomial coefficient because only one ordering is possible.',
    answer: "The geometric distribution answers 'how long until the first success?' Roll a die until a six: the first six is on roll 3 exactly when rolls 1 and 2 are not sixes and roll 3 is, so P(X = 3) = (5/6)(5/6)(1/6) = 25/216. In general P(X = k) = (1−p)^(k−1) p. Unlike the binomial there's no C(n,k), because the pattern is fixed: failures, then the success. Two useful facts: P(X > k) = (1−p)^k (all of the first k trials fail), and the expected wait is 1/p — six rolls for a six, twenty inspections for a defect with p = 0.05. Don't confuse the mean with the most likely value: the single most likely waiting time is always k = 1, and the average is larger because occasionally the wait is very long. Also keep the geometric separate from the binomial: 'first defective is the 4th part' is 0.8³ × 0.2, while 'exactly one defective among 4 parts' is 4 × 0.2 × 0.8³.",
  },
  items: [
    { type: 'recall', prompt: r`State the geometric PMF for the number of trials up to and including the first success, its expectation, and the formula for $P(X > k)$.`, answer: r`$P(X = k) = (1-p)^{k-1}p$ for $k = 1, 2, \dots$; $E[X] = 1/p$; $P(X > k) = (1-p)^k$.` },
    {
      type: 'apply',
      prompt: 'A part is defective with probability 0.02, independently. What is the probability that the first defective is the 5th part inspected? What is the expected number of parts inspected up to and including the first defective?',
      answer: r`$P(X = 5) = 0.98^4 \times 0.02 \approx 0.9224 \times 0.02 \approx 0.0184$; $E[X] = 1/0.02 = 50$.`,
      exact: '0.0184; 50',
      rubric: ['Uses 0.98⁴ × 0.02 (four good parts then a defective).', 'Gives ≈ 0.018.', 'Gives E[X] = 50.'],
    },
    {
      type: 'apply',
      prompt: 'A fair coin is flipped until the first head. What is the probability that more than 4 flips are needed?',
      answer: r`More than 4 flips means the first 4 are all tails: $P(X > 4) = (1/2)^4 = 1/16$.`,
      exact: '1/16',
      rubric: ['Interprets X > 4 as the first four flips all failing.', 'Uses (1 − p)^4.', 'Gives 1/16.'],
    },
    {
      type: 'explain',
      prompt: r`Explain why $P(X = k) = (1-p)^{k-1}p$ has no binomial coefficient, unlike the binomial PMF.`,
      answer: r`The event 'first success on trial $k$' requires one specific sequence: failures on trials $1, \dots, k-1$ and a success on trial $k$. There is exactly one such ordering, with probability $(1-p)^{k-1}p$ by independence. In the binomial, 'exactly $k$ successes in $n$ trials' can be realised by $\binom{n}{k}$ different orderings of the successes, all equally likely, so their probabilities are added — that is where the coefficient comes from.`,
      rubric: [
        'States that the event requires a specific sequence: k − 1 failures then a success.',
        'States that there is exactly one such ordering.',
        'Contrasts with the binomial where successes can occupy C(n,k) different position sets.',
      ],
      tags: ['geometric-vs-binomial'],
    },
    {
      type: 'discriminate',
      prompt: "'The first defective is the 4th item inspected' versus 'exactly one defective among the first 4 items': write the probability of each when each item is defective with probability 0.2, and explain the difference.",
      answer: r`First defective on the 4th: geometric, $0.8^3 \times 0.2 = 0.1024$ — the first three must be good and the fourth defective. Exactly one defective among 4: binomial, $\binom{4}{1}(0.2)(0.8)^3 = 0.4096$ — the single defective can be in any of the four positions. The second event contains the first (position 4) plus three other placements, so it is four times as likely.`,
      rubric: [
        'Gives 0.8³ × 0.2 = 0.1024 for the geometric event.',
        'Gives C(4,1) × 0.2 × 0.8³ = 0.4096 for the binomial event.',
        'Explains that the binomial event allows the defective in any position while the geometric event fixes it at position 4 with the first three good.',
      ],
      tags: ['geometric-vs-binomial'],
    },
  ],
};

export const memorylessness: ConceptSpec = {
  id: 'c-memorylessness',
  name: 'Memorylessness',
  definition: r`The geometric distribution is memoryless: $P(X > m + k \mid X > m) = P(X > k)$. Having already waited through $m$ failures does not make a success any more (or less) likely on the coming trials — the process forgets the past.`,
  objectives: [
    ['understand', r`Prove memorylessness from $P(X > k) = (1-p)^k$.`],
    ['apply', 'Compute conditional waiting-time probabilities after a run of failures.'],
    ['analyze', "Connect memorylessness to the gambler's fallacy and explain what the long run does and does not guarantee."],
  ],
  misconceptions: [
    {
      tag: 'gamblers-fallacy',
      description: "Believes a success is 'due' after a run of failures (or that a streak makes the same result more likely).",
      remedy: 'The die has no memory: P(six on the next roll | 10 non-sixes) is still 1/6. Compute P(X > 13 | X > 10) explicitly.',
    },
    {
      tag: 'conditional-equals-unconditional-wait',
      description: 'Thinks memorylessness means P(X > m + k | X > m) equals P(X > m + k), i.e. that conditioning changes nothing.',
      remedy: 'Compute both for small numbers: P(X > 8 | X > 5) = (1−p)^3, which is much larger than P(X > 8) = (1−p)^8.',
    },
  ],
  examples: [
    { title: 'Roulette streak', body: r`Red has probability 18/37 on each spin. After 8 blacks in a row the next spin is still red with probability $18/37 \approx 0.486$.`, domain: 'games' },
    { title: 'Machine run', body: r`A machine fails on any day with probability 0.05, independently. After 30 failure-free days, $P(\text{survives 5 more}) = 0.95^5 \approx 0.774$ — the same as on day one.`, domain: 'manufacturing' },
    { title: 'Waiting for a bus', body: r`If a bus arrives in any given minute with probability 0.1 independently, then after 10 empty minutes the expected further wait is still 10 minutes.`, domain: 'transport' },
  ],
  script: {
    pretest: {
      prompt: 'You have rolled a fair die 10 times without a six. What is the probability that the next roll is a six? What is the probability that you still have no six after 3 more rolls?',
      isomorph: 'A machine fails on any given day with probability 0.05, independently of other days. It has run for 30 days without failure. What is the probability that it survives the next 5 days?',
      reference: r`$1/6$, unchanged. $P(X > 13 \mid X > 10) = (5/6)^3 \approx 0.579$, exactly as at the start. (Isomorph: $0.95^5 \approx 0.774$.)`,
    },
    guidingQuestions: [
      { question: 'Does the die remember the last 10 rolls? What is P(six on roll 11)?', expected: 'No. 1/6, exactly as for any roll.', probesMisconception: 'gamblers-fallacy' },
      { question: r`Write $P(X > 13 \mid X > 10)$ using the definition of conditional probability and $P(X > k) = (5/6)^k$.`, expected: 'P(X > 13)/P(X > 10) = (5/6)^13/(5/6)^10 = (5/6)^3, since {X > 13} is inside {X > 10}.' },
      { question: 'What is the general statement? Prove it in one line.', expected: 'P(X > m + k | X > m) = (1−p)^{m+k}/(1−p)^m = (1−p)^k = P(X > k).' },
      { question: 'Does memorylessness mean that P(X > 13 | X > 10) equals P(X > 13)?', expected: 'No: it equals P(X > 3), the probability of a fresh wait of 3. P(X > 13) = (5/6)^13 is much smaller.', probesMisconception: 'conditional-equals-unconditional-wait' },
      { question: "Why do people feel a six is 'due'? What is the true statement about long runs, as opposed to the next roll?", expected: 'They confuse the long-run proportion settling near 1/6 (law of large numbers) with individual rolls compensating; no roll compensates for earlier ones.' },
    ],
    workedExample: {
      problem: 'On a fair European roulette wheel red has probability 18/37 on each spin. After 8 blacks in a row, what is the probability of red on the next spin, and the probability of at least one red in the next 3 spins?',
      steps: [
        r`Spins are independent, so $P(\text{red next}) = 18/37 \approx 0.486$ regardless of the streak.`,
        r`$P(\text{no red in 3 spins}) = (19/37)^3 \approx 0.135$.`,
        r`$P(\text{at least one red in 3}) = 1 - 0.135 \approx 0.865$ — the same as for any 3 spins.`,
      ],
    },
    transfer: {
      prompt: 'A geometric waiting time has p = 0.1. Compute P(X > 15 | X > 10) and P(X > 5). Then explain in one sentence why they are equal.',
      reference: r`Both equal $0.9^5 \approx 0.590$: after 10 failures the remaining wait has the same distribution as a fresh wait, because the trials are independent and the past failures carry no information about future ones.`,
    },
    hints: [
      "Ask whether the die's physical behaviour on roll 11 can depend on what it showed earlier.",
      'Use P(X > m + k | X > m) = P(X > m + k) / P(X > m) and the formula P(X > k) = (1 − p)^k.',
      'P(X > 13) / P(X > 10) = (5/6)¹³ / (5/6)¹⁰. Cancel the common factors; what power of 5/6 is left?',
    ],
  },
  teach: {
    keyIdea: 'P(X > m + k | X > m) = P(X > k) for a geometric waiting time: past failures do not change the distribution of the remaining wait, which is why nothing is ever "due".',
    answer: "Memorylessness is the formal version of 'the dice have no memory'. Suppose you're rolling for a six and have failed 10 times. The chance of a six on the next roll is still 1/6, and the chance you're still waiting after 3 more rolls is (5/6)³ — exactly what it was before you started. In symbols, P(X > m + k | X > m) = P(X > k), and the proof is one line: P(X > m + k)/P(X > m) = (1−p)^(m+k)/(1−p)^m = (1−p)^k. This kills the gambler's fallacy, the feeling that a six is 'due' after a long drought. What is true is that over thousands of rolls the proportion of sixes settles near 1/6 — but that happens because the drought gets diluted by many more rolls, not because later rolls compensate. One subtlety: memorylessness doesn't say conditioning changes nothing; P(X > 13 | X > 10) = (5/6)³ is much bigger than P(X > 13) = (5/6)¹³. It says the remaining wait restarts fresh.",
  },
  items: [
    { type: 'recall', prompt: 'State the memoryless property of the geometric distribution in symbols and in words.', answer: r`$P(X > m + k \mid X > m) = P(X > k)$ for all $m, k \ge 0$. In words: given that the first $m$ trials were all failures, the number of additional trials needed has the same distribution as the original waiting time — the past failures are forgotten.` },
    {
      type: 'apply',
      prompt: 'Items are independently defective with probability 0.1. The first 20 items inspected were all fine. What is the probability that the next 3 are also fine? What is the probability that the first defective is item 22 (the 2nd item from now)?',
      answer: r`$P(\text{next 3 fine}) = 0.9^3 = 0.729$ (memorylessness: the 20 good items are irrelevant). $P(\text{first defective is the 2nd from now}) = 0.9 \times 0.1 = 0.09$.`,
      exact: '0.729; 0.09',
      rubric: ['Gives 0.9³ = 0.729 without adjusting for the 20 previous items.', 'Gives 0.9 × 0.1 = 0.09.', 'Does not treat the streak as changing the per-item probability.'],
    },
    {
      type: 'explain',
      prompt: r`Prove that a geometric random variable is memoryless, starting from $P(X > k) = (1-p)^k$.`,
      answer: r`Since $\{X > m + k\} \subseteq \{X > m\}$, the intersection is $\{X > m + k\}$, so $P(X > m + k \mid X > m) = \dfrac{P(X > m + k)}{P(X > m)} = \dfrac{(1-p)^{m+k}}{(1-p)^m} = (1-p)^k = P(X > k)$.`,
      rubric: [
        'Writes the conditional probability as the ratio P(X > m + k)/P(X > m), noting {X > m + k} ⊆ {X > m}.',
        'Substitutes (1 − p)^(m+k) / (1 − p)^m.',
        'Simplifies to (1 − p)^k = P(X > k).',
      ],
    },
    {
      type: 'explain',
      prompt: "A gambler says: 'Red hasn't come up in 8 spins, so it's due.' Using memorylessness, explain why this is wrong, and say what is true about the long run instead.",
      answer: "Spins are independent, so the probability of red on the next spin is the same 18/37 as always; the past 8 blacks carry no information about the future, which is exactly what memorylessness says: P(X > 8 + k | X > 8) = P(X > k). The belief that a result becomes more likely because it is 'overdue' is the gambler's fallacy. What is true is that over a very large number of spins the proportion of reds settles near 18/37 — but this happens because the 8-black stretch is swamped by many further spins, not because later spins lean towards red to compensate.",
      rubric: [
        'States that spins are independent and the next-spin probability is unchanged.',
        "Identifies the belief as the gambler's fallacy (or explicitly applies memorylessness).",
        'States that long-run proportions converge by dilution, not by compensation.',
      ],
      tags: ['gamblers-fallacy'],
    },
    {
      type: 'discriminate',
      prompt: r`Compare $P(X > 8)$ with $P(X > 8 \mid X > 5)$ for a geometric variable with $p = 0.25$, and explain why they differ even though the process is memoryless.`,
      answer: r`$P(X > 8) = 0.75^8 \approx 0.100$. $P(X > 8 \mid X > 5) = 0.75^3 \approx 0.422$. They differ because conditioning on $X > 5$ removes the possibility that the success already occurred in the first 5 trials. Memorylessness does not say conditioning is irrelevant; it says the conditional probability equals $P(X > 3)$ — the remaining wait starts afresh.`,
      rubric: [
        'Computes P(X > 8) = 0.75⁸ ≈ 0.10.',
        'Computes P(X > 8 | X > 5) = 0.75³ ≈ 0.42.',
        'Explains that memorylessness equates the conditional to P(X > 3) (restarted wait), not to the unconditional P(X > 8).',
      ],
      tags: ['conditional-equals-unconditional-wait'],
    },
  ],
};

/** Unit 2, lessons 3-4: joint and marginal distributions, independent random variables, covariance; sample mean, law of large numbers, Monte Carlo. */
import { r, type ConceptSpec } from './helpers.ts';

export const jointMarginal: ConceptSpec = {
  id: 'c-joint-marginal-distributions',
  name: 'Joint and marginal distributions',
  definition: r`The joint PMF of two discrete random variables gives $p(x, y) = P(X = x, Y = y)$ for every pair of values. Summing over one variable gives the marginal PMF of the other, $p_X(x) = \sum_y p(x, y)$; dividing a cell by a marginal gives a conditional PMF.`,
  objectives: [
    ['apply', 'Read joint probabilities from a table and compute marginal PMFs.'],
    ['apply', r`Compute conditional PMFs and probabilities of events such as $P(X = Y)$ or $P(X \le Y)$ from a joint table.`],
    ['understand', 'Explain why the marginals alone do not determine the joint distribution.'],
  ],
  misconceptions: [
    {
      tag: 'marginals-determine-joint',
      description: 'Believes the joint table can be reconstructed from the two marginals.',
      remedy: 'Show two different 2×2 tables with identical row and column sums (independent vs. concentrated on the diagonal).',
    },
    {
      tag: 'joint-table-not-summing-to-one',
      description: 'Forgets that the whole table must sum to 1, or normalises a row by the wrong total when computing a conditional.',
      remedy: 'Make summing the table the first check; for a conditional, the denominator is the total of the row or column being conditioned on.',
    },
  ],
  examples: [
    { title: 'Defects by shift', body: r`$p(0, \text{day}) = 0.50$, $p(1, \text{day}) = 0.05$, $p(0, \text{night}) = 0.36$, $p(1, \text{night}) = 0.09$. Marginal $P(X = 1) = 0.14$; conditional $P(X = 1 \mid \text{night}) = 0.09/0.45 = 0.2$.`, domain: 'manufacturing' },
    { title: 'Rain and delay', body: r`$P(R = 1) = 0.3$; $p(R = 1, D = 1) = 0.2$, $p(R = 0, D = 1) = 0.14$. Then $P(D = 1) = 0.34$, $P(D = 1 \mid R = 1) = 2/3$, $P(D = 1 \mid R = 0) = 0.2$.`, domain: 'weather' },
    { title: 'Die and maximum', body: r`$X$ = first die, $Y$ = max of two dice: $p(2, 2) = 2/36$, $P(Y = 2) = 3/36$, so $P(X = 2 \mid Y = 2) = 2/3$.`, domain: 'games' },
  ],
  script: {
    pretest: {
      prompt: 'X is the number of defects on a part (0 or 1) and Y is the shift that made it (1 = day, 2 = night). The joint PMF is p(0,1) = 0.50, p(1,1) = 0.05, p(0,2) = 0.36, p(1,2) = 0.09. Find P(X = 1) and P(X = 1 | Y = 2).',
      isomorph: 'Joint PMF: p(0,0) = 0.3, p(0,1) = 0.2, p(1,0) = 0.1, p(1,1) = 0.4 (X first, Y second). Find P(Y = 1) and P(X = 1 | Y = 1).',
      reference: r`$P(X = 1) = 0.05 + 0.09 = 0.14$. $P(Y = 2) = 0.36 + 0.09 = 0.45$, so $P(X = 1 \mid Y = 2) = 0.09/0.45 = 0.2$. (Isomorph: $P(Y = 1) = 0.6$; $P(X = 1 \mid Y = 1) = 0.4/0.6 = 2/3$.)`,
    },
    guidingQuestions: [
      { question: 'Lay the four numbers out in a 2×2 table with X as rows and Y as columns. What does each cell mean, and what must the whole table add up to?', expected: 'Each cell is the probability of that (X, Y) pair occurring together; the total is 1.', probesMisconception: 'joint-table-not-summing-to-one' },
      { question: 'To get P(X = 1) regardless of shift, which cells do you add?', expected: 'The X = 1 row: 0.05 + 0.09 = 0.14 — a marginal probability.' },
      { question: 'For P(X = 1 | Y = 2), which part of the table do you restrict to, and what is the denominator?', expected: 'The Y = 2 column, total 0.45: 0.09/0.45 = 0.2.' },
      { question: 'If I gave you only P(X = 1) = 0.14 and P(Y = 2) = 0.45, could you recover p(1, 2)?', expected: 'No: many tables share those marginals; the joint carries extra information about how X and Y relate.', probesMisconception: 'marginals-determine-joint' },
    ],
    workedExample: {
      problem: 'Two fair dice; X is the first die and Y is the larger of the two values. Find P(X = 2, Y = 2), P(Y = 2) and P(X = 2 | Y = 2).',
      steps: [
        r`$X = 2$ and $Y = 2$ means the first die is 2 and the second is at most 2: outcomes (2,1), (2,2), so $p(2, 2) = 2/36$.`,
        r`$Y = 2$: outcomes (1,2), (2,1), (2,2), so $P(Y = 2) = 3/36$.`,
        r`$P(X = 2 \mid Y = 2) = (2/36)/(3/36) = 2/3$.`,
      ],
    },
    transfer: {
      prompt: 'Rain (R = 1) has probability 0.3. The joint PMF with commute delay D (1 = delayed) has p(R = 1, D = 1) = 0.2 and p(R = 0, D = 1) = 0.14. Find P(D = 1), P(D = 1 | R = 1) and P(D = 1 | R = 0).',
      reference: r`$P(D = 1) = 0.2 + 0.14 = 0.34$; $P(D = 1 \mid R = 1) = 0.2/0.3 = 2/3$; $P(D = 1 \mid R = 0) = 0.14/0.7 = 0.2$.`,
    },
    hints: [
      'Draw a 2×2 table with defect count as rows and shift as columns, and fill in the four probabilities.',
      'Marginal of X: add across each row. Conditional on Y = 2: divide the cell by the total of that column.',
      'P(X = 1) = p(1,1) + p(1,2) = 0.05 + 0.09. P(Y = 2) = 0.36 + 0.09. Then P(X = 1 | Y = 2) = p(1,2) / P(Y = 2).',
    ],
  },
  teach: {
    keyIdea: 'a joint PMF gives the probability of each pair of values; summing rows or columns gives marginals, dividing a cell by a row/column total gives a conditional, and the marginals alone do not determine the joint.',
    answer: "When you track two random quantities at once, you describe them with a joint PMF: a table where each cell is the probability of a particular pair of values. Example: parts from a factory, X = defective or not, Y = day or night shift. Cells might be 0.50 (good, day), 0.05 (defective, day), 0.36 (good, night), 0.09 (defective, night) — adding to 1. To get the distribution of one variable on its own, add along the rows or columns: P(defective) = 0.05 + 0.09 = 0.14. These row/column totals are called marginals because they sit in the margins of the table. Conditioning means zooming into one row or column and rescaling: P(defective | night) = 0.09/0.45 = 0.2. A key point is that the marginals lose information: many different tables have the same margins, and only the joint table tells you how the two variables relate.",
  },
  items: [
    { type: 'recall', prompt: 'Define the joint PMF of two discrete random variables and explain how to obtain a marginal PMF from it.', answer: r`The joint PMF is $p(x, y) = P(X = x, Y = y)$, defined for every pair of values and summing to 1 over all pairs. The marginal PMF of $X$ is obtained by summing the joint over all values of $Y$: $p_X(x) = \sum_y p(x, y)$ (a row total of the table); similarly for $Y$.` },
    {
      type: 'apply',
      prompt: 'Joint PMF (X first, Y second): p(1,1) = 0.1, p(1,2) = 0.2, p(2,1) = 0.3, p(2,2) = 0.4. Find P(X = 2), P(Y = 1) and P(X = Y).',
      answer: r`$P(X = 2) = 0.3 + 0.4 = 0.7$; $P(Y = 1) = 0.1 + 0.3 = 0.4$; $P(X = Y) = p(1,1) + p(2,2) = 0.1 + 0.4 = 0.5$.`,
      exact: '0.7; 0.4; 0.5',
      rubric: ['Gives P(X = 2) = 0.7.', 'Gives P(Y = 1) = 0.4.', 'Gives P(X = Y) = 0.5 by adding the diagonal cells.'],
    },
    {
      type: 'apply',
      prompt: 'From the same table (p(1,1) = 0.1, p(1,2) = 0.2, p(2,1) = 0.3, p(2,2) = 0.4), find the conditional PMF of X given Y = 2.',
      answer: r`$P(Y = 2) = 0.2 + 0.4 = 0.6$. $P(X = 1 \mid Y = 2) = 0.2/0.6 = 1/3$; $P(X = 2 \mid Y = 2) = 0.4/0.6 = 2/3$. (They sum to 1.)`,
      exact: '1/3; 2/3',
      rubric: ['Uses the column total P(Y = 2) = 0.6 as the denominator.', 'Gives P(X = 1 | Y = 2) = 1/3.', 'Gives P(X = 2 | Y = 2) = 2/3.'],
    },
    {
      type: 'explain',
      prompt: 'Explain why two different joint distributions can have exactly the same marginals. Give a small numerical example.',
      answer: r`The marginals record only how each variable behaves on its own; the joint also records how the two vary together, and that extra information is not recoverable from the margins. Example with $X, Y \in \{0, 1\}$ and all marginals equal to 1/2: Table A has 0.25 in every cell (independent). Table B has $p(0,0) = p(1,1) = 0.5$ and zeros off the diagonal ($Y$ always equals $X$). Both have row sums and column sums of 0.5, but they describe completely different relationships.`,
      rubric: [
        'Gives two distinct tables with identical row and column sums.',
        'States that the marginals describe each variable alone.',
        'States that the joint carries the relationship/dependence information the marginals discard.',
      ],
      tags: ['marginals-determine-joint'],
    },
    { type: 'cloze', prompt: 'In a joint PMF table, summing a row gives a ____ probability, while dividing a cell by its column total gives a ____ probability.', answer: 'marginal; conditional' },
  ],
};

export const independentRandomVariables: ConceptSpec = {
  id: 'c-independent-random-variables',
  name: 'Independent random variables',
  definition: r`Random variables $X$ and $Y$ are independent when $p(x, y) = p_X(x)\,p_Y(y)$ for every pair of values, so the joint table is the product of its margins. Then $E[XY] = E[X]E[Y]$ and $\mathrm{Var}(X + Y) = \mathrm{Var}(X) + \mathrm{Var}(Y)$.`,
  objectives: [
    ['apply', 'Test independence from a joint table by checking every cell against the product of the marginals.'],
    ['understand', 'Explain what independence means for the conditional distributions of one variable given the other.'],
    ['apply', 'Use independence to compute joint probabilities, expectations of products and variances of sums.'],
  ],
  misconceptions: [
    {
      tag: 'one-cell-check-suffices',
      description: 'Concludes independence after checking that a single cell equals the product of its marginals.',
      remedy: 'Show a table where one cell factorises and another does not; independence requires every cell.',
    },
    {
      tag: 'variances-always-add',
      description: 'Adds variances of dependent variables as if they were independent.',
      remedy: 'Take Y = X: Var(X + X) = Var(2X) = 4 Var(X), not 2 Var(X).',
    },
  ],
  examples: [
    { title: 'Two dice', body: r`$P(X = 3, Y \ge 5) = \tfrac16 \cdot \tfrac26 = \tfrac{1}{18}$; $E[XY] = 3.5^2 = 12.25$; $\mathrm{Var}(X + Y) = 35/12 + 35/12 = 35/6$.`, domain: 'games' },
    { title: 'Two machines', body: r`Independent daily outputs with means 200, 150 and SDs 10, 8: total has mean 350 and SD $\sqrt{164} \approx 12.8$.`, domain: 'manufacturing' },
    { title: 'A factorising table', body: r`$p(0,0) = 0.24$, $p(0,1) = 0.36$, $p(1,0) = 0.16$, $p(1,1) = 0.24$: margins $(0.6, 0.4)$ and $(0.4, 0.6)$, and every cell is the product, so $X$ and $Y$ are independent.`, domain: 'abstract' },
  ],
  script: {
    pretest: {
      prompt: 'Joint PMF: p(0,0) = 0.24, p(0,1) = 0.36, p(1,0) = 0.16, p(1,1) = 0.24. Are X and Y independent?',
      isomorph: 'Joint PMF: p(0,0) = 0.3, p(0,1) = 0.2, p(1,0) = 0.1, p(1,1) = 0.4. Are X and Y independent?',
      reference: r`Marginals: $P(X = 0) = 0.6$, $P(X = 1) = 0.4$; $P(Y = 0) = 0.4$, $P(Y = 1) = 0.6$. Products: $0.24, 0.36, 0.16, 0.24$ — every cell matches, so yes, independent. (Isomorph: $P(X = 0)P(Y = 0) = 0.5 \times 0.4 = 0.2 \ne 0.3$, so not independent.)`,
    },
    guidingQuestions: [
      { question: 'Compute the marginal PMFs of X and of Y from the table.', expected: 'P(X = 0) = 0.6, P(X = 1) = 0.4; P(Y = 0) = 0.4, P(Y = 1) = 0.6.' },
      { question: 'Multiply P(X = 0) by P(Y = 0). Does it equal p(0,0)? Are we done?', expected: '0.6 × 0.4 = 0.24 = p(0,0). Not done: every cell must factorise.', probesMisconception: 'one-cell-check-suffices' },
      { question: 'Check the remaining three cells.', expected: '0.6 × 0.6 = 0.36, 0.4 × 0.4 = 0.16, 0.4 × 0.6 = 0.24 — all match, so X and Y are independent.' },
      { question: 'What does independence say about P(Y = 1 | X = 0) compared with P(Y = 1 | X = 1)?', expected: 'Both equal P(Y = 1) = 0.6: knowing X tells you nothing about Y.' },
      { question: 'For independent X and Y we can add variances. Try Y = X: is Var(X + X) = 2 Var(X)?', expected: 'No: Var(2X) = 4 Var(X). Adding variances needs independence (or zero covariance).', probesMisconception: 'variances-always-add' },
    ],
    workedExample: {
      problem: 'X and Y are two fair dice. Using independence, find P(X = 3, Y ≥ 5), E[XY] and Var(X + Y).',
      steps: [
        r`$P(X = 3, Y \ge 5) = P(X = 3)\,P(Y \ge 5) = \tfrac16 \cdot \tfrac26 = \tfrac{1}{18}$.`,
        r`$E[XY] = E[X]E[Y] = 3.5 \times 3.5 = 12.25$.`,
        r`$\mathrm{Var}(X + Y) = \mathrm{Var}(X) + \mathrm{Var}(Y) = 35/12 + 35/12 = 35/6 \approx 5.83$.`,
      ],
    },
    transfer: {
      prompt: 'Two machines produce independent daily outputs with means 200 and 150 units and standard deviations 10 and 8. Find the mean and standard deviation of the total daily output.',
      reference: r`Mean $= 350$. $\mathrm{Var} = 10^2 + 8^2 = 164$, so SD $= \sqrt{164} \approx 12.8$ (not $10 + 8 = 18$: SDs do not add, variances do).`,
    },
    hints: [
      'Independence of X and Y means every cell of the joint table equals the product of the corresponding margins.',
      'Compute the two marginals first, then check the product rule cell by cell — all four cells.',
      'P(X = 0) = 0.24 + 0.36 = 0.60; P(Y = 0) = 0.24 + 0.16 = 0.40. Check: 0.60 × 0.40 = 0.24 = p(0,0). Now do the same for the other three cells.',
    ],
  },
  teach: {
    keyIdea: 'X and Y are independent when every cell of the joint PMF equals the product of the marginals; then E[XY] = E[X]E[Y] and Var(X + Y) = Var(X) + Var(Y).',
    answer: "Two random variables are independent when knowing one tells you nothing about the other. In a joint table, that means every cell is the product of its row total and column total — the table 'factorises'. Take p(0,0) = 0.24, p(0,1) = 0.36, p(1,0) = 0.16, p(1,1) = 0.24. The margins are (0.6, 0.4) for X and (0.4, 0.6) for Y, and 0.6 × 0.4 = 0.24, 0.6 × 0.6 = 0.36, 0.4 × 0.4 = 0.16, 0.4 × 0.6 = 0.24 — all four match, so X and Y are independent. Checking one cell isn't enough; a single non-matching cell breaks independence. The payoff is computational: for independent variables E[XY] = E[X]E[Y] and Var(X + Y) = Var(X) + Var(Y). So the sum of two dice has variance 35/12 + 35/12. Remember variances add but standard deviations don't, and that adding variances is only legal when the variables are independent — Var(X + X) is 4 Var(X), not 2 Var(X).",
  },
  items: [
    { type: 'recall', prompt: 'State the condition for two discrete random variables to be independent, and two consequences for expectation and variance.', answer: r`$X$ and $Y$ are independent if $p(x, y) = p_X(x)\,p_Y(y)$ for all $x, y$. Consequences: $E[XY] = E[X]E[Y]$ and $\mathrm{Var}(X + Y) = \mathrm{Var}(X) + \mathrm{Var}(Y)$.` },
    {
      type: 'apply',
      prompt: 'Joint PMF: p(1,1) = 0.1, p(1,2) = 0.2, p(2,1) = 0.3, p(2,2) = 0.4. Are X and Y independent? Show your check.',
      answer: r`$P(X = 1) = 0.3$, $P(Y = 1) = 0.4$, so $P(X = 1)P(Y = 1) = 0.12 \ne p(1,1) = 0.1$. Not independent (one failing cell is enough to rule it out).`,
      exact: 'not independent',
      rubric: ['Computes the relevant marginals (e.g. P(X = 1) = 0.3, P(Y = 1) = 0.4).', 'Compares a product of marginals with the corresponding cell.', 'Concludes correctly that X and Y are not independent.'],
    },
    {
      type: 'apply',
      prompt: 'X and Y are independent with E[X] = 4, Var(X) = 2, E[Y] = 1, Var(Y) = 3. Find E[X + Y], Var(X + Y), E[XY] and Var(2X − Y).',
      answer: r`$E[X + Y] = 5$; $\mathrm{Var}(X + Y) = 2 + 3 = 5$; $E[XY] = 4 \times 1 = 4$; $\mathrm{Var}(2X - Y) = 4 \times 2 + 1 \times 3 = 11$.`,
      exact: '5; 5; 4; 11',
      rubric: ['Gives E[X + Y] = 5 and E[XY] = 4.', 'Gives Var(X + Y) = 5 using independence.', 'Gives Var(2X − Y) = 4·2 + 3 = 11 (the minus sign does not subtract variance).'],
    },
    {
      type: 'explain',
      prompt: r`Explain why $\mathrm{Var}(X + Y) = \mathrm{Var}(X) + \mathrm{Var}(Y)$ needs independence (or at least zero covariance) while $E[X + Y] = E[X] + E[Y]$ does not. Use $Y = X$ as a test case.`,
      answer: r`Expectation is linear for all random variables: with $Y = X$, $E[X + X] = 2E[X]$, which is exactly $E[X] + E[Y]$. Variance is not: $\mathrm{Var}(X + X) = \mathrm{Var}(2X) = 4\,\mathrm{Var}(X)$, whereas adding the variances would give $2\,\mathrm{Var}(X)$. The general formula is $\mathrm{Var}(X + Y) = \mathrm{Var}(X) + \mathrm{Var}(Y) + 2\,\mathrm{Cov}(X, Y)$; the cross term is zero for independent variables but equals $2\,\mathrm{Var}(X)$ when $Y = X$.`,
      rubric: [
        'Shows Var(X + X) = 4 Var(X) ≠ 2 Var(X).',
        'Shows E[X + X] = 2E[X], consistent with linearity.',
        'Identifies the cross term 2 Cov(X, Y) that vanishes under independence.',
      ],
      tags: ['variances-always-add'],
    },
    {
      type: 'predict',
      prompt: 'Before checking: in a joint table where every row is proportional to every other row, do you expect X and Y to be independent? Then verify with p(0,0) = 0.1, p(0,1) = 0.3, p(1,0) = 0.15, p(1,1) = 0.45.',
      answer: r`Yes: proportional rows mean the conditional distribution of $Y$ is the same for every $x$, which is independence. Check: $P(X = 0) = 0.4$, $P(X = 1) = 0.6$, $P(Y = 0) = 0.25$, $P(Y = 1) = 0.75$; products $0.1, 0.3, 0.15, 0.45$ match every cell.`,
    },
  ],
};

export const covariance: ConceptSpec = {
  id: 'c-covariance',
  name: 'Covariance and correlation',
  definition: r`Covariance $\mathrm{Cov}(X, Y) = E[(X - \mu_X)(Y - \mu_Y)] = E[XY] - E[X]E[Y]$ measures whether $X$ and $Y$ tend to move together (positive) or oppositely (negative); correlation $\rho = \mathrm{Cov}(X,Y)/(\sigma_X \sigma_Y)$ rescales it to $[-1, 1]$. In general $\mathrm{Var}(X + Y) = \mathrm{Var}(X) + \mathrm{Var}(Y) + 2\,\mathrm{Cov}(X, Y)$.`,
  objectives: [
    ['apply', 'Compute covariance and correlation from a small joint table or from given SDs and correlation.'],
    ['understand', 'Interpret the sign and size of covariance and correlation.'],
    ['analyze', 'Explain why independence implies zero covariance but zero covariance does not imply independence.'],
  ],
  misconceptions: [
    {
      tag: 'zero-covariance-implies-independence',
      description: 'Assumes uncorrelated variables must be independent.',
      remedy: 'X uniform on {−1, 0, 1} and Y = X²: Cov = 0 yet Y is a function of X.',
    },
    {
      tag: 'covariance-comparable-across-scales',
      description: 'Compares covariances of pairs measured in different units as if a bigger covariance meant a stronger relationship.',
      remedy: 'Covariance has units (units of X × units of Y); rescale to correlation before comparing strength.',
    },
  ],
  examples: [
    { title: 'Matching bits', body: r`$p(0,0) = p(1,1) = 0.4$, $p(0,1) = p(1,0) = 0.1$: $E[X] = E[Y] = 0.5$, $E[XY] = 0.4$, $\mathrm{Cov} = 0.15$, $\rho = 0.15/0.25 = 0.6$.`, domain: 'abstract' },
    { title: 'Two stocks', body: r`Daily return SDs 2% and 3%, correlation 0.5: $\mathrm{Cov} = 0.5 \times 2 \times 3 = 3$ (%²); $\mathrm{Var}(\text{sum}) = 4 + 9 + 6 = 19$, SD $\approx 4.4\%$.`, domain: 'finance' },
    { title: 'Uncorrelated but dependent', body: r`$X$ uniform on $\{-1, 0, 1\}$, $Y = X^2$: $E[XY] = E[X^3] = 0 = E[X]E[Y]$, so $\mathrm{Cov} = 0$, but $P(X = 0, Y = 1) = 0 \ne P(X = 0)P(Y = 1)$.`, domain: 'abstract' },
  ],
  script: {
    pretest: {
      prompt: 'Joint PMF: p(0,0) = 0.4, p(0,1) = 0.1, p(1,0) = 0.1, p(1,1) = 0.4. Find Cov(X, Y).',
      isomorph: 'Joint PMF: p(0,0) = 0.1, p(0,1) = 0.4, p(1,0) = 0.4, p(1,1) = 0.1. Find Cov(X, Y).',
      reference: r`$E[X] = E[Y] = 0.5$; $E[XY] = 1 \cdot 1 \cdot 0.4 = 0.4$; $\mathrm{Cov} = 0.4 - 0.25 = 0.15$. (Isomorph: $E[XY] = 0.1$, so $\mathrm{Cov} = -0.15$.)`,
    },
    guidingQuestions: [
      { question: 'Compute E[X] and E[Y] from the marginals.', expected: 'P(X = 1) = 0.5 so E[X] = 0.5; likewise E[Y] = 0.5.' },
      { question: 'For E[XY], which cells contribute a non-zero product?', expected: 'Only (1,1): E[XY] = 1 × 1 × 0.4 = 0.4.' },
      { question: 'So Cov(X, Y) = E[XY] − E[X]E[Y] = ? What does the sign tell you?', expected: '0.4 − 0.25 = 0.15; positive: X and Y tend to be equal (both 0 or both 1).' },
      { question: 'Var(X) = Var(Y) = 0.25. What is the correlation? What would it be if Y were exactly equal to X?', expected: '0.15/0.25 = 0.6; ρ = 1 if Y = X.', probesMisconception: 'covariance-comparable-across-scales' },
      { question: 'If the covariance had come out as 0, would X and Y have to be independent?', expected: 'No: zero covariance only rules out linear association; e.g. X uniform on {−1,0,1} and Y = X² have Cov 0 but are dependent.', probesMisconception: 'zero-covariance-implies-independence' },
    ],
    workedExample: {
      problem: r`$X$ is uniform on $\{-1, 0, 1\}$ and $Y = X^2$. Show that $\mathrm{Cov}(X, Y) = 0$ even though $Y$ is completely determined by $X$.`,
      steps: [
        r`$E[X] = (-1 + 0 + 1)/3 = 0$.`,
        r`$XY = X^3 = X$, so $E[XY] = E[X] = 0$.`,
        r`$\mathrm{Cov}(X, Y) = E[XY] - E[X]E[Y] = 0 - 0 \cdot E[Y] = 0$.`,
        r`Yet $P(X = 0, Y = 1) = 0$ while $P(X = 0)P(Y = 1) = \tfrac13 \cdot \tfrac23 = \tfrac29$, so $X$ and $Y$ are not independent.`,
      ],
    },
    transfer: {
      prompt: 'Two stocks have daily return standard deviations of 2% and 3%, with correlation 0.5. Find the covariance of the returns and the variance and SD of the sum of the two returns.',
      reference: r`$\mathrm{Cov} = 0.5 \times 2 \times 3 = 3$ (%²). $\mathrm{Var}(\text{sum}) = 4 + 9 + 2 \times 3 = 19$, so SD $= \sqrt{19} \approx 4.36\%$.`,
    },
    hints: [
      'Covariance asks whether above-average X tends to go with above-average Y. Start with the means.',
      'Use Cov(X, Y) = E[XY] − E[X]E[Y]; for E[XY], sum x·y·p(x, y) over the table.',
      'E[X] = P(X = 1) = 0.5, E[Y] = 0.5. E[XY] = 1·1·p(1,1) + 0 for the other cells = 0.4. Now subtract the product of the means.',
    ],
  },
  teach: {
    keyIdea: 'Cov(X, Y) = E[XY] − E[X]E[Y] measures linear co-movement, correlation rescales it to [−1, 1], and zero covariance does not imply independence.',
    answer: "Covariance measures whether two random variables tend to be above their means at the same time. Formally Cov(X, Y) = E[(X − μX)(Y − μY)], or more conveniently E[XY] − E[X]E[Y]. Example: X and Y are 0/1 variables with p(0,0) = p(1,1) = 0.4 and p(0,1) = p(1,0) = 0.1. Both means are 0.5, E[XY] = 0.4, so Cov = 0.4 − 0.25 = 0.15: positive, because they usually match. Covariance has units, so to judge strength we divide by the two standard deviations to get the correlation, which always lies between −1 and 1; here 0.15/(0.5 × 0.5) = 0.6. Covariance also appears in Var(X + Y) = Var(X) + Var(Y) + 2 Cov(X, Y). Two warnings: independence forces Cov = 0, but Cov = 0 does not force independence — X uniform on {−1, 0, 1} and Y = X² have zero covariance even though Y is determined by X — because covariance only detects linear relationships.",
  },
  items: [
    { type: 'recall', prompt: r`Give the definition and the shortcut formula for $\mathrm{Cov}(X, Y)$, and the formula for $\mathrm{Var}(X + Y)$ in general.`, answer: r`$\mathrm{Cov}(X, Y) = E[(X - \mu_X)(Y - \mu_Y)] = E[XY] - E[X]E[Y]$. $\mathrm{Var}(X + Y) = \mathrm{Var}(X) + \mathrm{Var}(Y) + 2\,\mathrm{Cov}(X, Y)$.` },
    {
      type: 'apply',
      prompt: 'Joint PMF: p(1,1) = 0.1, p(1,2) = 0.2, p(2,1) = 0.3, p(2,2) = 0.4. Find Cov(X, Y).',
      answer: r`$E[X] = 1(0.3) + 2(0.7) = 1.7$; $E[Y] = 1(0.4) + 2(0.6) = 1.6$; $E[XY] = 1(0.1) + 2(0.2) + 2(0.3) + 4(0.4) = 2.7$. $\mathrm{Cov} = 2.7 - 1.7 \times 1.6 = 2.7 - 2.72 = -0.02$.`,
      exact: '-0.02',
      rubric: ['Computes E[X] = 1.7 and E[Y] = 1.6.', 'Computes E[XY] = 2.7.', 'Gives Cov = −0.02.'],
    },
    {
      type: 'apply',
      prompt: 'Var(X) = 9, Var(Y) = 16 and the correlation between X and Y is −0.5. Find Cov(X, Y) and Var(X + Y).',
      answer: r`$\mathrm{Cov} = \rho\,\sigma_X\sigma_Y = -0.5 \times 3 \times 4 = -6$. $\mathrm{Var}(X + Y) = 9 + 16 + 2(-6) = 13$.`,
      exact: '-6; 13',
      rubric: ['Uses σ_X = 3 and σ_Y = 4.', 'Gives Cov = −6.', 'Gives Var(X + Y) = 13.'],
    },
    {
      type: 'explain',
      prompt: 'Explain why independence implies zero covariance but zero covariance does not imply independence. Include a concrete counterexample.',
      answer: r`If $X$ and $Y$ are independent then $E[XY] = E[X]E[Y]$, so $\mathrm{Cov}(X, Y) = E[XY] - E[X]E[Y] = 0$. The converse fails because covariance only detects linear association. Counterexample: $X$ uniform on $\{-1, 0, 1\}$ and $Y = X^2$. Then $E[X] = 0$ and $E[XY] = E[X^3] = 0$, so $\mathrm{Cov} = 0$; but $Y$ is a function of $X$ — e.g. $P(X = 0, Y = 1) = 0 \ne P(X = 0)P(Y = 1) = 2/9$ — so they are dependent.`,
      rubric: [
        'Shows independence ⇒ E[XY] = E[X]E[Y] ⇒ Cov = 0.',
        'Gives a valid counterexample with zero covariance and dependence (e.g. X uniform on {−1,0,1}, Y = X²).',
        'States that covariance measures only linear association.',
      ],
      tags: ['zero-covariance-implies-independence'],
    },
    {
      type: 'discriminate',
      prompt: r`How does correlation differ from covariance, and when would you prefer each? Give the range of the correlation coefficient and say what $\rho = 1$ means.`,
      answer: r`Correlation is covariance divided by the product of the two standard deviations: $\rho = \mathrm{Cov}(X, Y)/(\sigma_X \sigma_Y)$. It is unit-free and always lies in $[-1, 1]$, with $\rho = \pm 1$ exactly when $Y$ is a linear function of $X$ (perfect positive or negative linear relationship). Covariance keeps the units of $X \times Y$, so its size depends on the scales of measurement; it is the natural quantity in formulas such as $\mathrm{Var}(X + Y)$. Use correlation to compare the strength of association across different pairs of variables, and covariance when you need the actual variance of a sum or a portfolio.`,
      rubric: [
        'States that correlation is covariance divided by the product of the SDs (unit-free).',
        'Gives the range [−1, 1].',
        'States that ρ = ±1 means an exact linear relationship.',
        'Notes that covariance depends on units/scales while correlation is comparable across pairs.',
      ],
      tags: ['covariance-comparable-across-scales'],
    },
  ],
};

export const sampleMean: ConceptSpec = {
  id: 'c-sample-mean',
  name: 'The sample mean and its variance',
  definition: r`For $n$ independent observations $X_1, \dots, X_n$ each with mean $\mu$ and variance $\sigma^2$, the sample mean $\bar{X} = \frac{1}{n}\sum X_i$ has $E[\bar{X}] = \mu$ and $\mathrm{Var}(\bar{X}) = \sigma^2/n$, so its standard deviation shrinks like $\sigma/\sqrt{n}$.`,
  objectives: [
    ['understand', 'Derive the mean and variance of the sample mean from linearity, independence and the scaling rule for variance.'],
    ['apply', 'Compute the standard deviation of an average for a given n.'],
    ['analyze', r`Determine the sample size needed to reduce the SD of the average by a given factor (the $\sqrt{n}$ law).`],
  ],
  misconceptions: [
    {
      tag: 'sd-shrinks-linearly-with-n',
      description: 'Thinks the SD of the average is σ/n rather than σ/√n.',
      remedy: 'Derive Var(X̄) = σ²/n step by step, then take the square root; check with n = 4 (SD halves, not quarters).',
    },
    {
      tag: 'averaging-does-not-reduce-spread',
      description: 'Thinks the average of n observations has the same spread as a single observation.',
      remedy: 'Compare one die roll (SD 1.71) with the average of 100 rolls (SD 0.17).',
    },
  ],
  examples: [
    { title: 'Average of 100 dice', body: r`One roll: $\mu = 3.5$, $\sigma^2 = 35/12$. Average of 100: mean 3.5, variance $35/1200$, SD $\approx 0.17$.`, domain: 'games' },
    { title: 'Mean of 36 patients', body: r`Blood pressure SD 12 mmHg; the mean of 36 patients has SD $12/6 = 2$ mmHg; reaching SD 1 needs 144 patients.`, domain: 'medicine' },
    { title: 'Averaged sensor', body: r`Single readings have SD 0.8; averaging 4 gives SD 0.4; reaching 0.1 needs 64 readings.`, domain: 'engineering' },
  ],
  script: {
    pretest: {
      prompt: 'A single die roll has mean 3.5 and variance 35/12 ≈ 2.92. What are the mean and standard deviation of the average of 100 independent rolls?',
      isomorph: 'Part lengths have mean 50 mm and SD 0.4 mm. What are the mean and SD of the average length of 16 independently sampled parts?',
      reference: r`Mean 3.5; $\mathrm{Var}(\bar{X}) = 2.92/100 = 0.0292$; SD $\approx 0.171$. (Isomorph: mean 50 mm, SD $0.4/4 = 0.1$ mm.)`,
    },
    guidingQuestions: [
      { question: r`Write the average as $(X_1 + \cdots + X_{100})/100$. What is the expected value of the sum? Of the average?`, expected: 'E[sum] = 100 × 3.5 = 350 by linearity; E[average] = 3.5.' },
      { question: 'What is the variance of the sum, and which property makes that easy?', expected: 'Var(sum) = 100 × 35/12 ≈ 292, because independent variances add.' },
      { question: 'Now divide the sum by 100 — what happens to the variance under scaling by 1/100?', expected: 'Var(sum/100) = Var(sum)/100² = σ²/100 ≈ 0.0292.', probesMisconception: 'sd-shrinks-linearly-with-n' },
      { question: 'So the SD of the average is σ/10 ≈ 0.17, not σ/100. Compare with one roll (SD 1.71). How many rolls would you need for SD ≈ 0.05?', expected: 'Averaging shrinks spread by √n; n = (1.71/0.05)² ≈ 1170.', probesMisconception: 'averaging-does-not-reduce-spread' },
    ],
    workedExample: {
      problem: 'Systolic blood pressure in a population has SD 12 mmHg. A study reports the average of 36 randomly chosen patients. What is the SD of that average? How many patients would be needed to bring it down to 1 mmHg?',
      steps: [
        r`$\mathrm{SD}(\bar{X}) = \sigma/\sqrt{n} = 12/\sqrt{36} = 12/6 = 2$ mmHg.`,
        r`For SD 1: $12/\sqrt{n} = 1 \Rightarrow \sqrt{n} = 12 \Rightarrow n = 144$.`,
        'Halving the SD requires four times as many patients — the √n law.',
      ],
    },
    transfer: {
      prompt: "A sensor's single readings have SD 0.8 units. You average 4 readings. What is the SD of the average? To get down to 0.1, how many readings must be averaged?",
      reference: r`$0.8/\sqrt{4} = 0.4$. For 0.1: $0.8/\sqrt{n} = 0.1 \Rightarrow n = 64$.`,
    },
    hints: [
      'Write the average as a sum divided by n, and handle the sum first.',
      'E[sum] = nμ and, by independence, Var(sum) = nσ². Then apply the rules for scaling by 1/n.',
      'Var(sum of 100 rolls) = 100 × 2.92 = 292. Var(average) = 292 / 100² = 0.0292. Take the square root for the SD.',
    ],
  },
  teach: {
    keyIdea: 'the average of n independent observations has mean μ and variance σ²/n, so its SD is σ/√n — averaging reduces spread, but only by the square root of n.',
    answer: "Averaging is the most basic noise-reduction tool, and this concept says exactly how much it helps. Take n independent observations, each with mean μ and variance σ². Their sum has mean nμ (linearity) and variance nσ² (variances add for independent variables). Dividing by n divides the mean by n, back to μ, and divides the variance by n², giving σ²/n. So the SD of the average is σ/√n. Example: a die roll has SD about 1.71; the average of 100 rolls has SD 0.171. Note the square root: 100 rolls shrink the spread by 10, not 100. To halve the SD you need four times the data; to get ten times the precision you need a hundred times the data. This √n law explains why the law of large numbers works — the spread of the average goes to zero — and why precision is expensive.",
  },
  items: [
    { type: 'recall', prompt: r`For $n$ independent observations each with mean $\mu$ and variance $\sigma^2$, give the mean and variance of the sample mean $\bar{X}$.`, answer: r`$E[\bar{X}] = \mu$ and $\mathrm{Var}(\bar{X}) = \sigma^2/n$, so $\mathrm{SD}(\bar{X}) = \sigma/\sqrt{n}$.` },
    {
      type: 'apply',
      prompt: 'Daily rainfall at a station has mean 3 mm and standard deviation 6 mm. Treating days as independent, find the mean and standard deviation of the average rainfall over 36 days.',
      answer: r`Mean $= 3$ mm. SD $= 6/\sqrt{36} = 1$ mm.`,
      exact: '3; 1',
      rubric: ['Gives the mean 3 mm (unchanged).', 'Divides the SD by √36 = 6.', 'Gives SD 1 mm.'],
    },
    {
      type: 'apply',
      prompt: 'A single measurement has SD 2. How many independent measurements must be averaged to bring the SD of the average down to 0.25?',
      answer: r`$2/\sqrt{n} = 0.25 \Rightarrow \sqrt{n} = 8 \Rightarrow n = 64$.`,
      exact: '64',
      rubric: ['Sets up σ/√n = 0.25.', 'Solves √n = 8.', 'Gives n = 64.'],
    },
    {
      type: 'explain',
      prompt: r`Explain why the standard deviation of an average shrinks with $\sqrt{n}$ rather than with $n$.`,
      answer: r`The sum of $n$ independent observations has variance $n\sigma^2$, because variances of independent variables add. Dividing by $n$ scales the variance by $1/n^2$ (the $a^2$ rule), giving $\mathrm{Var}(\bar{X}) = n\sigma^2/n^2 = \sigma^2/n$. The SD is the square root, $\sigma/\sqrt{n}$. The square root appears because the variance, not the SD, is what scales linearly with $n$. Consequently halving the SD requires four times the sample size.`,
      rubric: [
        'States Var(sum) = nσ² by independence.',
        'Applies the a² scaling rule to get σ²/n.',
        'Takes the square root to get σ/√n.',
        'Notes that halving the SD requires four times the sample size (or equivalent consequence).',
      ],
      tags: ['sd-shrinks-linearly-with-n'],
    },
    {
      type: 'predict',
      prompt: 'Before calculating: which has more spread — a single die roll, or the average of 4 die rolls? By what factor do their SDs differ? Then verify.',
      answer: r`The single roll has more spread; the average of 4 has half the SD ($\sqrt{4} = 2$). Single roll: SD $\approx 1.71$; average of 4: $1.71/2 \approx 0.85$.`,
    },
  ],
};

export const lawOfLargeNumbers: ConceptSpec = {
  id: 'c-law-of-large-numbers',
  name: 'The law of large numbers',
  definition: r`As the number of independent repetitions grows, the sample mean (or sample proportion) converges to the true expected value (or probability): the probability that $\bar{X}_n$ lies far from $\mu$ tends to zero. It justifies interpreting probabilities as long-run frequencies — by dilution of early fluctuations, not by later compensation.`,
  objectives: [
    ['understand', r`State the law of large numbers and connect it to $\mathrm{Var}(\bar{X}_n) = \sigma^2/n \to 0$.`],
    ['analyze', "Distinguish convergence of proportions from 'compensation' (the law of averages / gambler's fallacy)."],
    ['apply', 'Predict how the typical fluctuation of a sample proportion scales with n.'],
  ],
  misconceptions: [
    {
      tag: 'law-of-averages',
      description: "Thinks deviations are corrected: after an excess of heads, tails become more likely so that things 'even out'.",
      remedy: 'Show that the expected excess count does not shrink — the proportion converges because the excess is divided by a growing n.',
    },
    {
      tag: 'small-samples-representative',
      description: 'Expects small samples to look like the population (the "law of small numbers").',
      remedy: '7 heads in 10 flips is ordinary (about 1.3 SD); 700 in 1000 is essentially impossible (about 12.6 SD).',
    },
  ],
  examples: [
    { title: 'Coin after a streak', body: r`8 heads in 10 flips, then 1000 more: expected heads in the next 1000 is 500, so the expected proportion after 1010 flips is $508/1010 \approx 0.503$ — near 0.5 by dilution.`, domain: 'games' },
    { title: 'House edge', body: r`10,000 bets of \$1 with expected loss \$0.02 and SD \$1 each: expected total loss \$200 with SD \$100. The house almost surely wins.`, domain: 'games' },
    { title: 'Insurance pool', body: r`10,000 independent policies with expected claim \$500 and SD \$2000: the average claim has SD \$20, making the pooled outcome predictable.`, domain: 'finance' },
  ],
  script: {
    pretest: {
      prompt: "You flip a fair coin 10 times and get 8 heads. Over the next 1000 flips, should you expect more tails than heads to 'balance things out'? What will the overall proportion of heads look like after all 1010 flips?",
      isomorph: "A machine's true defect rate is 2%. In the first 50 parts you see 5 defectives. Should the next 1000 parts have fewer than 2% defective to compensate? What is the expected defect proportion over all 1050 parts?",
      reference: r`No: each future flip is still 50/50, so expect about 500 heads and 500 tails. The expected total is $508/1010 \approx 0.503$: the excess of 3 heads is not cancelled, it is diluted. (Isomorph: expect 20 defectives in the next 1000; expected proportion $25/1050 \approx 0.024$.)`,
    },
    guidingQuestions: [
      { question: 'In the next 1000 flips, what is the expected number of heads? Does the coin know about the 8 heads?', expected: '500; no — the flips are independent.', probesMisconception: 'law-of-averages' },
      { question: 'So after 1010 flips, what is the expected total number of heads, and the expected proportion?', expected: '508 and 508/1010 ≈ 0.503.' },
      { question: 'The excess of heads did not shrink, yet the proportion moved toward 0.5. How is that possible?', expected: 'The excess of 3 is divided by a much larger n — dilution, not compensation.' },
      { question: r`What does $\mathrm{Var}(\bar{X}_n) = \sigma^2/n$ say about how far the proportion typically sits from 0.5 after $n$ flips?`, expected: 'SD = 0.5/√n → 0, so large deviations become vanishingly unlikely: that is the law of large numbers.' },
      { question: 'Is it surprising to see 8 heads in 10 flips? What about 800 in 1000?', expected: 'The first is fairly common (about 5%); the second is essentially impossible (≈19 SDs). Small samples fluctuate wildly.', probesMisconception: 'small-samples-representative' },
    ],
    workedExample: {
      problem: 'A casino game gives the house a 2% edge: on each \\$1 bet the player\'s expected loss is \\$0.02 with SD about \\$1. For a player making 10,000 independent \\$1 bets, find the expected total loss and its SD, and comment.',
      steps: [
        r`Expected total $= 10{,}000 \times (-0.02) = -\$200$.`,
        r`$\mathrm{Var}(\text{total}) = 10{,}000 \times 1 = 10{,}000$, so SD $= \$100$.`,
        'The expected loss is 2 SDs below zero; the chance of the player being ahead after 10,000 bets is small (roughly 2%), and it shrinks further with more bets.',
        r`Per bet, the average loss has SD $\$1/\sqrt{10{,}000} = \$0.01$ against a mean of $-\$0.02$: the law of large numbers is the house's business model.`,
      ],
    },
    transfer: {
      prompt: 'An insurer covers 10,000 independent policies, each with expected claim \\$500 and SD \\$2000. What are the mean and SD of the average claim per policy? Why does pooling make the business predictable?',
      reference: r`Mean \$500; SD $= 2000/\sqrt{10{,}000} = \$20$. The average claim is almost certain to fall within a few percent of \$500, so premiums can be set with confidence — individual claims are wildly variable, but their average is not.`,
    },
    hints: [
      'Separate two questions: the number of heads in the next 1000 flips, and the proportion of heads over all 1010.',
      'Each future flip is still 50/50, so compute the expected count for the next 1000, then the expected proportion over the whole run.',
      'Expected heads in the next 1000 = 500, so the expected total is 8 + 500 = 508 out of 1010. The excess of 3 heads is unchanged; what is 508/1010?',
    ],
  },
  teach: {
    keyIdea: 'the sample mean converges to the expected value as n grows because Var(X̄) = σ²/n → 0; early deviations are diluted, never compensated.',
    answer: "The law of large numbers says that if you repeat an experiment many times independently, the average result settles down to the expected value, and the proportion of times an event happens settles down to its probability. It's why we can interpret 'probability 1/6' as 'about one in six rolls in the long run'. The mechanism is the shrinking variance of the average: SD(X̄) = σ/√n goes to zero. The important thing it does NOT say is that the coin corrects itself. Flip 10 times and get 8 heads; the next 1000 flips still average 500 heads, so you end up with about 508 out of 1010 — 50.3%. The excess of 3 never went away; it just got swamped. Believing the coin owes you tails is the 'law of averages', which is false. And the law only bites for large n: 7 heads in 10 is unremarkable, whereas 700 in 1000 would be a miracle.",
  },
  items: [
    { type: 'recall', prompt: 'State the law of large numbers in words, and say what quantity it says converges and to what.', answer: r`For independent repetitions with a common mean $\mu$, the sample mean $\bar{X}_n$ converges to $\mu$ as $n \to \infty$: for any tolerance, the probability that $\bar{X}_n$ differs from $\mu$ by more than that tolerance tends to zero. For an event, the sample proportion converges to the event's probability.` },
    {
      type: 'explain',
      prompt: "Explain the difference between the law of large numbers and the 'law of averages'. Use the example of a coin that has shown 8 heads in 10 flips.",
      answer: "The law of large numbers says the proportion of heads over n flips converges to 0.5 as n grows: after 1010 flips the proportion is very likely close to 0.5. The 'law of averages' claims that after 8 heads in 10, tails are now more likely so that the results even out. That is false — each flip is still 50/50, so the next 1000 flips are expected to give 500 heads and 500 tails, leaving the excess of 3 heads intact (508 heads out of 1010). The proportion approaches 0.5 because the fixed excess is divided by an ever larger n — dilution — not because later flips compensate.",
      rubric: [
        'States that the LLN concerns the proportion (or sample mean) converging to 0.5 as n grows.',
        "Identifies the 'law of averages' claim of compensation and states that it is false because flips are independent.",
        'Explains that convergence happens by dilution (fixed excess divided by growing n), with the numerical illustration 508/1010 or similar.',
      ],
      tags: ['gamblers-fallacy', 'law-of-averages'],
    },
    {
      type: 'apply',
      prompt: r`A fair coin is flipped $n$ times. The SD of the proportion of heads is $0.5/\sqrt{n}$. For $n = 100$ and $n = 10{,}000$, what are these SDs? Roughly what range (mean ± 2 SD) would you expect the proportion to fall in for each?`,
      answer: r`$n = 100$: SD $= 0.05$, range about 0.40–0.60. $n = 10{,}000$: SD $= 0.005$, range about 0.49–0.51.`,
      exact: '0.05; 0.005',
      rubric: ['Gives SD 0.05 for n = 100.', 'Gives SD 0.005 for n = 10,000.', 'Gives the ranges 0.40–0.60 and 0.49–0.51 (or equivalent).'],
    },
    {
      type: 'discriminate',
      prompt: "'Small samples are representative' versus the law of large numbers: which is more surprising — 7 heads in 10 flips, or 700 heads in 1000 flips — and why? Use the SD of the proportion in your answer.",
      answer: r`For $n = 10$ the SD of the proportion is $0.5/\sqrt{10} \approx 0.158$, so 0.7 is only $(0.7 - 0.5)/0.158 \approx 1.3$ SDs above 0.5 — unremarkable (it happens about 17% of the time). For $n = 1000$ the SD is $0.5/\sqrt{1000} \approx 0.0158$, so 0.7 is about 12.6 SDs above 0.5 — essentially impossible for a fair coin. The law of large numbers constrains large samples tightly but says almost nothing about small ones, so expecting a small sample to mirror the population is a mistake.`,
      rubric: [
        'Computes the SD for n = 10 (≈ 0.158) and finds 7/10 is only about 1.3 SD away — unsurprising.',
        'Computes the SD for n = 1000 (≈ 0.016) and finds 700/1000 is about 12.6 SD away — essentially impossible.',
        'Concludes that the LLN constrains only large samples.',
      ],
      tags: ['small-samples-representative'],
    },
    {
      type: 'predict',
      prompt: 'Before we simulate: if we plot the running proportion of sixes over 10,000 die rolls, describe what the curve should look like near the start versus near the end. Separately, what does the running excess count (sixes so far − n/6) do?',
      answer: r`The running proportion swings widely in the first few dozen rolls and then settles into an ever-narrower band around $1/6 \approx 0.167$ (its SD shrinks like $1/\sqrt{n}$). The excess count does not settle: its SD grows like $\sqrt{n}$, so it wanders further from 0 over time — the proportion converges only because that wandering count is divided by $n$.`,
    },
  ],
};

export const monteCarlo: ConceptSpec = {
  id: 'c-monte-carlo-simulation',
  name: 'Simulation as a check (Monte Carlo)',
  definition: r`Monte Carlo simulation estimates a probability or expectation by generating many random repetitions of an experiment and taking the observed proportion or average. By the law of large numbers the estimate converges, with standard error roughly $\sqrt{p(1-p)/n}$ for a proportion.`,
  objectives: [
    ['understand', 'Explain why a simulated proportion approximates a probability and how its error scales with the number of trials.'],
    ['apply', 'Design a simulation for a probability question: the state, one trial, the success condition, the estimate and the number of trials.'],
    ['analyze', 'Use a simulation to check an analytic answer and judge whether a discrepancy is sampling noise or a mistake.'],
  ],
  misconceptions: [
    {
      tag: 'simulation-is-exact',
      description: 'Treats a simulated estimate as the exact answer, ignoring Monte Carlo error.',
      remedy: 'Compute the standard error for the number of trials used, and quote the estimate with ± 2 SE.',
    },
    {
      tag: 'more-trials-fix-wrong-model',
      description: 'Believes that running more repetitions will fix a simulation whose trial is set up incorrectly.',
      remedy: 'More trials only shrink sampling noise; a wrong trial converges precisely to the wrong number.',
    },
  ],
  examples: [
    { title: 'At least one six', body: r`Trial: 4 random integers in 1–6; success if any equals 6. 10,000 trials give an estimate within about $\pm 0.01$ of $0.518$.`, domain: 'games' },
    { title: 'Hat-check matches', body: r`Trial: a random permutation of 5; record the number of fixed points. The average over 20,000 trials lands within about $\pm 0.02$ of the theoretical value 1.`, domain: 'puzzles' },
    { title: 'Birthday problem', body: r`Trial: 23 random days in 1–365; success if any repeat. With 1000 trials the SE is about $0.016$, so an estimate of 0.49 is consistent with the theoretical 0.507.`, domain: 'social' },
  ],
  script: {
    pretest: {
      prompt: 'You want to check P(at least one six in 4 rolls) ≈ 0.518 by simulation. Describe the simulation: what one trial is, the success condition, how the estimate is formed, and roughly how many trials you would run for an error of about ±0.01.',
      isomorph: 'You want to check P(both cards are aces in a 2-card draw) ≈ 0.0045 by simulation. Describe one trial and the estimate, and explain why you need far more trials than for the four-dice question to get a useful relative precision.',
      reference: r`Trial: generate 4 random integers from 1 to 6; success if any equals 6. Estimate $\hat{p}$ = successes / trials. SE $\approx \sqrt{0.5 \times 0.5 / n}$; for SE $= 0.01$ (2 SE $\approx 0.02$) about $n = 2500$, or $n = 10{,}000$ for $\pm 0.01$ at 2 SE. (Isomorph: trial = draw 2 cards without replacement from 52, success if both aces. With $p \approx 0.0045$ the SE $\sqrt{p(1-p)/n}$ must be small relative to $p$ itself, so $n$ in the hundreds of thousands is needed for ~5% relative error.)`,
    },
    guidingQuestions: [
      { question: 'What is one repetition of the experiment, described precisely enough to program?', expected: 'Generate four independent uniform random integers from 1 to 6 and check whether at least one is 6.' },
      { question: "Suppose 5230 out of 10,000 trials succeed. What is your estimate — and is it 'the answer'?", expected: '0.523. It is an estimate with sampling noise, not the exact probability.', probesMisconception: 'simulation-is-exact' },
      { question: 'How far off could it be? Use the SD of a proportion.', expected: 'SE ≈ √(0.52 × 0.48 / 10,000) ≈ 0.005, so 0.523 ± 0.01 comfortably covers 0.518.' },
      { question: 'Your simulation gives 0.42 with 100,000 trials, but theory says 0.518. Could that be noise?', expected: 'No: SE ≈ 0.0016, and 0.1 is over 60 SEs away. Either the simulation or the derivation is wrong — more trials will not help.', probesMisconception: 'more-trials-fix-wrong-model' },
    ],
    workedExample: {
      problem: 'Estimate the expected number of people who get their own hat when 5 hats are returned at random, by simulation, and compare with the theoretical value 1.',
      steps: [
        'One trial: generate a uniformly random permutation of {1, …, 5} and count the fixed points (positions i with π(i) = i).',
        'Repeat N = 20,000 times and average the counts.',
        r`The count has SD about 1, so the SE of the average is about $1/\sqrt{20{,}000} \approx 0.007$; expect the estimate within about $\pm 0.015$ of 1.`,
        'An estimate of 0.99 or 1.01 confirms the theory; an estimate of 1.2 would indicate a bug (e.g. a non-uniform shuffle).',
      ],
    },
    transfer: {
      prompt: 'Design a simulation to estimate the probability that among 23 people at least two share a birthday. Say how you would check it against the theoretical value 0.507, and how you would decide whether a result of 0.49 from 1000 trials contradicts the theory.',
      reference: r`Trial: draw 23 independent uniform integers from 1 to 365; success if any value repeats. Estimate = successes / 1000. SE $\approx \sqrt{0.5 \times 0.5/1000} \approx 0.016$. 0.49 is about 1 SE below 0.507 — entirely consistent. A result like 0.40 (≈ 6.7 SE away) would indicate an error.`,
    },
    hints: [
      'Think of the simulation as the experiment repeated many times by a computer; what is one repetition?',
      'Estimate = (number of successful trials)/(number of trials); its SD is √(p(1 − p)/n), which tells you how many trials you need.',
      'One trial: generate 4 random integers 1–6 and record whether any is 6. Repeat n times; estimate p̂ = successes/n. For error ≈ 0.01: solve √(0.5 × 0.5 / n) = 0.01 for n.',
    ],
  },
  teach: {
    keyIdea: 'a Monte Carlo estimate is the proportion (or average) over many simulated trials; it converges by the law of large numbers with standard error about √(p(1−p)/n), and it can only check a correctly specified trial.',
    answer: "Monte Carlo simulation is probability by brute force: instead of deriving P(A), you make a computer perform the experiment thousands of times and count how often A happens. Want P(at least one six in 4 rolls)? Generate 4 random numbers from 1 to 6, check for a six, repeat 10,000 times; if 5230 trials succeed, your estimate is 0.523. The law of large numbers guarantees this converges to the true 0.518, and the SD of a sample proportion, √(p(1−p)/n) ≈ 0.005 here, tells you the precision — so 0.523 is well within noise. Two habits matter. First, always report the error: an estimate is not the exact answer. Second, remember that more trials only reduce noise; if your trial is wrong — say you sample cards with replacement when the problem is without — the estimate converges confidently to the wrong number. Simulation and theory check each other: a discrepancy of many standard errors means one of them has a mistake.",
  },
  items: [
    { type: 'recall', prompt: 'What is a Monte Carlo estimate of a probability, and what is the approximate standard error of a simulated proportion?', answer: r`Run $n$ independent simulated trials of the experiment and estimate $P(A)$ by $\hat{p}$ = (number of trials in which $A$ occurred)/$n$. Its standard error is approximately $\sqrt{p(1-p)/n}$ (use $\hat{p}$ in place of $p$), so the error shrinks like $1/\sqrt{n}$.` },
    {
      type: 'apply',
      prompt: 'A simulation of 40,000 trials estimates a probability as 0.25. What is the approximate standard error of this estimate? Would a theoretical value of 0.26 be consistent with it?',
      answer: r`SE $\approx \sqrt{0.25 \times 0.75 / 40{,}000} = \sqrt{0.0000046875} \approx 0.0022$. The value 0.26 is $0.01/0.0022 \approx 4.6$ SEs away, so it is not consistent with the simulation: either the theory or the simulation set-up is wrong.`,
      exact: '0.0022',
      rubric: ['Uses √(p(1 − p)/n) with p = 0.25 and n = 40,000.', 'Gives SE ≈ 0.0022.', 'Judges 0.26 (about 4.6 SE away) as inconsistent with the estimate.'],
    },
    {
      type: 'apply',
      prompt: 'You want the Monte Carlo standard error of an estimated proportion near 0.5 to be 0.005. How many trials are needed?',
      answer: r`$\sqrt{0.25/n} = 0.005 \Rightarrow 0.25/n = 0.000025 \Rightarrow n = 10{,}000$.`,
      exact: '10000',
      rubric: ['Sets up √(0.5 × 0.5 / n) = 0.005.', 'Solves for n.', 'Gives n = 10,000.'],
    },
    {
      type: 'explain',
      prompt: 'Explain why running more trials reduces the error of a Monte Carlo estimate, but cannot fix a simulation whose trial is set up incorrectly. Give an example of an incorrect trial set-up.',
      answer: r`The estimate is a sample mean of independent trial outcomes, so its standard error is $\sigma/\sqrt{n}$ (about $\sqrt{p(1-p)/n}$ for a proportion) and shrinks as $n$ grows — that is the law of large numbers at work. But it converges to the expected value of whatever the trial actually computes. If the trial is wrong, the estimate converges precisely to the wrong quantity, and more trials merely make the wrong number more precise. Example: estimating P(two aces) by drawing cards with replacement when the real draw is without replacement gives $(4/52)^2 \approx 0.0059$ instead of $1/221 \approx 0.0045$; or using a success condition of 'exactly one six' when the question asks for 'at least one'.`,
      rubric: [
        'States that the error is proportional to 1/√n (sample mean / law of large numbers).',
        'States that a wrong trial converges to the wrong quantity, so more trials cannot fix it.',
        'Gives a concrete example of an incorrect trial set-up (wrong sampling scheme or wrong success condition).',
      ],
      tags: ['more-trials-fix-wrong-model'],
    },
    {
      type: 'apply',
      bloom: 'analyze',
      prompt: 'Describe a simulation — trial, success condition, number of trials and expected precision — to estimate the probability that a 5-card hand contains exactly two aces (theoretical value ≈ 0.0399).',
      answer: r`Trial: shuffle a 52-card deck (or sample 5 distinct cards uniformly without replacement) and take the first 5 cards. Success: the hand contains exactly 2 aces. Estimate = successes / n. SE $\approx \sqrt{0.04 \times 0.96 / n}$; with $n = 100{,}000$ the SE is about $0.0006$, so the estimate should land within about $\pm 0.0012$ of 0.0399 — precise enough to detect a bug such as sampling with replacement.`,
      rubric: [
        'Specifies a trial that samples 5 distinct cards without replacement (shuffle or equivalent).',
        'States the success condition as exactly two aces.',
        'Forms the estimate as a proportion and gives its SE ≈ √(0.04 × 0.96 / n).',
        'Chooses an n and states the resulting precision (e.g. n = 100,000 → SE ≈ 0.0006).',
      ],
    },
  ],
};

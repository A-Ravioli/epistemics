/** Unit 1, lessons 1-2: sample spaces, equally likely outcomes, complement; counting. */
import { r, type ConceptSpec } from './helpers.ts';

export const sampleSpacesEvents: ConceptSpec = {
  id: 'c-sample-spaces-events',
  name: 'Sample spaces and events',
  definition: r`The sample space $S$ is the set of all possible outcomes of a random experiment; an event is any subset of $S$, and it "occurs" when the actual outcome lies in it.`,
  objectives: [
    ['remember', 'List the sample space of a simple experiment (coin flips, dice, draws, inspections) systematically.'],
    ['understand', "Express everyday statements ('at least one head', 'not a six') as events, using union, intersection and complement."],
    ['apply', 'Count the outcomes in an event by enumerating the sample space at the right level of detail.'],
  ],
  misconceptions: [
    {
      tag: 'outcomes-listed-at-wrong-granularity',
      description: "Lists 'outcomes' as summaries (e.g. {0 heads, 1 head, 2 heads} for two coins) and later treats those summaries as equally likely.",
      remedy: 'Ask them to list the two coins separately (HH, HT, TH, TT) and check whether "one head" appears once or twice in that list.',
    },
    {
      tag: 'event-is-single-outcome',
      description: 'Believes an event must be a single outcome rather than a set of outcomes.',
      remedy: "Ask: is 'rolling an even number' one outcome or a collection of outcomes? Which outcomes make it true?",
    },
  ],
  examples: [
    { title: 'Two coins', body: r`Flip two coins. $S = \{HH, HT, TH, TT\}$. The event "exactly one head" is $\{HT, TH\}$; "at least one head" is $\{HH, HT, TH\}$.`, domain: 'games' },
    { title: 'Blood type of a donor', body: 'Record a donor\'s ABO group and Rh factor. $S$ has 8 outcomes: O+, O−, A+, A−, B+, B−, AB+, AB−. The event "Rh-negative" is {O−, A−, B−, AB−}.', domain: 'medicine' },
    { title: 'Three inspected parts', body: r`Each of three parts is labelled G (good) or D (defective): $S$ has $2^3 = 8$ outcomes such as GDG. "At most one defective" is $\{GGG, DGG, GDG, GGD\}$.`, domain: 'manufacturing' },
  ],
  script: {
    pretest: {
      prompt: "Two fair coins are flipped. Write down the sample space and the event 'exactly one head'.",
      isomorph: "A fair die is rolled twice. How many outcomes are in the sample space, and how many are in the event 'the two rolls show the same number'?",
      reference: r`$S = \{HH, HT, TH, TT\}$; exactly one head $= \{HT, TH\}$. (Isomorph: 36 ordered outcomes; 6 of them have equal rolls.)`,
    },
    guidingQuestions: [
      { question: 'If I flip a coin and then flip it again, what are all the things that could happen? Try to list them so that nothing is missed and nothing is counted twice.', expected: 'HH, HT, TH, TT — four ordered outcomes, listed by treating the two flips separately.', probesMisconception: 'outcomes-listed-at-wrong-granularity' },
      { question: 'Is HT the same outcome as TH? Why does it matter which way we list them?', expected: 'They are different sequences (first coin differs). Keeping them separate keeps every listed outcome equally likely.' },
      { question: "Which of those outcomes make the sentence 'exactly one head' true? So what is the event, as a set?", expected: '{HT, TH}: an event is the set of outcomes that make the statement true.', probesMisconception: 'event-is-single-outcome' },
      { question: "How would you write 'at least one head'? And 'no heads'? What do you notice about those two sets together?", expected: '{HH, HT, TH} and {TT}; they do not overlap and together make up the whole sample space (they are complements).' },
    ],
    workedExample: {
      problem: "Three parts come off a production line; each is inspected and labelled D (defective) or G (good). Describe the sample space and the event 'at most one defective'.",
      steps: [
        'Each part gets one of 2 labels and there are 3 parts, so an outcome is an ordered triple such as GGD.',
        r`List all $2^3 = 8$ outcomes: GGG, GGD, GDG, DGG, GDD, DGD, DDG, DDD.`,
        "'At most one defective' means 0 or 1 D: {GGG, GGD, GDG, DGG} — 4 outcomes.",
        "Its complement, 'at least two defective', is the other 4 outcomes; the two events split $S$.",
      ],
    },
    transfer: {
      prompt: "A blood donor's type is recorded as one of O, A, B, AB together with Rh factor + or −. Write the sample space and the event 'the donor is Rh-negative or type O'.",
      reference: '8 outcomes: O+, O−, A+, A−, B+, B−, AB+, AB−. The event is {O+, O−, A−, B−, AB−} (all four Rh-negative types plus O+): 5 outcomes.',
    },
    hints: [
      'Start by naming the single action that is being repeated, then think about what one complete result of the whole experiment looks like.',
      'Write each outcome as an ordered string with one letter per coin, and list them systematically (change the last letter first).',
      'First coin H: second coin H or T gives HH, HT. First coin T: gives TH and one more. Finish the list, then pick out the strings with exactly one H.',
    ],
  },
  teach: {
    keyIdea: 'the sample space is the complete list of possible outcomes and an event is a subset of it, so an event can contain several outcomes.',
    answer: "A random experiment is anything whose result we can't predict in advance, like flipping two coins. The sample space is the complete list of what could happen: HH, HT, TH, TT. Notice I keep HT and TH separate, because the first coin really is a different coin from the second; that way each of the four outcomes is equally likely. An event is just a collection of outcomes we care about, like 'exactly one head' = {HT, TH}. Events can be combined: 'at least one head' = {HH, HT, TH}, 'no heads' = {TT}, and those two together cover everything with no overlap. Why it matters: every probability we compute later is a question about which outcomes belong to an event, so getting the list right is the foundation.",
  },
  items: [
    { type: 'recall', prompt: 'What is a sample space, and what is an event?', answer: 'The sample space is the set of all possible outcomes of an experiment. An event is a subset of the sample space; it occurs when the outcome that actually happens belongs to that subset.' },
    { type: 'cloze', prompt: "For two flips of a coin the sample space has ____ outcomes, and the event 'at least one tail' contains ____ of them.", answer: '4 outcomes; 3 of them (HT, TH, TT).' },
    {
      type: 'explain',
      prompt: "Explain why, when listing the sample space for two coin flips, we write HT and TH as separate outcomes rather than a single outcome 'one head and one tail'.",
      answer: 'HT and TH are different sequences: in HT the first coin shows heads, in TH it shows tails. Listing them separately gives four outcomes HH, HT, TH, TT that are each equally likely (probability 1/4). If we merged them into "one head, one tail" we would have three outcomes that are not equally likely — the merged one happens twice as often — and anyone treating the three as equally likely would wrongly get P(two heads) = 1/3 instead of 1/4.',
      rubric: [
        'States that HT and TH are different sequences (the first coin differs).',
        'States that listing them separately keeps every outcome equally likely (each with probability 1/4).',
        'Notes that merging them produces outcomes that are not equally likely, e.g. giving the wrong value 1/3 for two heads.',
      ],
    },
    {
      type: 'apply',
      prompt: "A fair die is rolled twice. How many outcomes are in the sample space, and how many outcomes are in the event 'the sum of the two rolls is 7'?",
      answer: 'The sample space consists of ordered pairs (first roll, second roll): 6 × 6 = 36 outcomes. The sum is 7 for (1,6), (2,5), (3,4), (4,3), (5,2), (6,1): 6 outcomes.',
      exact: '36; 6',
      rubric: ['Gives 36 as the size of the sample space.', 'Treats the rolls as ordered pairs (or otherwise counts (3,4) and (4,3) separately).', 'Counts exactly 6 outcomes with sum 7.'],
    },
    {
      type: 'apply',
      prompt: "A quality inspector checks 4 items, labelling each P (pass) or F (fail). Write the event 'exactly one item fails' as a set of outcomes and state how many outcomes it contains.",
      answer: 'Outcomes are strings of four letters. Exactly one F: {FPPP, PFPP, PPFP, PPPF}, which contains 4 outcomes (out of 2^4 = 16 in the sample space).',
      exact: '4',
      rubric: ['Represents outcomes as ordered 4-letter strings.', 'Lists exactly the four outcomes with a single F.', 'States the count 4.'],
    },
  ],
};

export const equallyLikelyOutcomes: ConceptSpec = {
  id: 'c-equally-likely-outcomes',
  name: 'Probability from equally likely outcomes',
  definition: r`When every outcome of a finite sample space is equally likely, the probability of an event is the number of outcomes in the event divided by the total number of outcomes: $P(A) = |A| / |S|$.`,
  objectives: [
    ['understand', 'State the equally-likely formula and the condition it requires.'],
    ['apply', 'Compute probabilities for dice, cards, coins and random selections by counting favourable outcomes.'],
    ['analyze', 'Recognise when listed outcomes are not equally likely and the formula does not apply.'],
  ],
  misconceptions: [
    {
      tag: 'equiprobability-bias',
      description: 'Treats any list of possible results as equally likely ("either it happens or it doesn\'t, so 50/50"; "sums 2 to 12 are 11 options, so 1/11 each").',
      remedy: 'Contrast {0, 1, 2 heads} with {HH, HT, TH, TT} for two coins; ask which listing has equally likely elements and how you can tell.',
    },
    {
      tag: 'favourable-over-unfavourable',
      description: 'Divides favourable by unfavourable outcomes (odds) instead of by the total.',
      remedy: 'Ask what the denominator must be for the probabilities of all outcomes to add up to 1.',
    },
  ],
  examples: [
    { title: 'Sum of two dice', body: r`Of the 36 equally likely ordered pairs, 6 have sum 7, so $P(\text{sum} = 7) = 6/36 = 1/6$. Sum 2 has only (1,1): $1/36$.`, domain: 'games' },
    { title: 'Random chart on a ward', body: 'A ward has 12 patients, 3 of them diabetic. A chart picked at random belongs to a diabetic patient with probability 3/12 = 1/4 — valid only because every chart is equally likely to be picked.', domain: 'medicine' },
    { title: 'Face card', body: r`One card from a 52-card deck: 12 face cards (J, Q, K in 4 suits), so $P(\text{face}) = 12/52 = 3/13 \approx 0.23$.`, domain: 'games' },
  ],
  script: {
    pretest: {
      prompt: 'Two fair dice are rolled. What is the probability that the sum is 7?',
      isomorph: 'Two fair dice are rolled. What is the probability that both dice show the same number?',
      reference: r`$6/36 = 1/6$: six of the 36 ordered pairs sum to 7. (Isomorph: 6 doubles out of 36, also $1/6$.)`,
    },
    guidingQuestions: [
      { question: 'How many equally likely outcomes are there when we roll two dice? What does one outcome look like?', expected: '36 ordered pairs (first die, second die).' },
      { question: "Someone says: 'the possible sums are 2 to 12, that's 11 possibilities, so P(sum = 7) = 1/11.' What's wrong with that?", expected: 'The eleven sums are not equally likely — sum 7 arises from six pairs, sum 2 from only one. The formula needs equally likely outcomes.', probesMisconception: 'equiprobability-bias' },
      { question: 'Which ordered pairs give sum 7? How many are there?', expected: '(1,6), (2,5), (3,4), (4,3), (5,2), (6,1): six pairs.' },
      { question: 'So what is the probability — and why is the denominator 36 rather than 30, the number of unfavourable outcomes?', expected: '6/36 = 1/6. Probability is favourable over total so that probabilities of all outcomes add to 1; favourable over unfavourable is the odds, not the probability.', probesMisconception: 'favourable-over-unfavourable' },
    ],
    workedExample: {
      problem: 'One card is drawn at random from a standard 52-card deck. What is the probability that it is a face card (J, Q or K)?',
      steps: [
        'The 52 cards are equally likely outcomes.',
        'Face cards: 3 ranks × 4 suits = 12 favourable outcomes.',
        r`$P(\text{face card}) = 12/52 = 3/13 \approx 0.231$.`,
      ],
    },
    transfer: {
      prompt: 'A ward has 12 patients, 3 of whom have diabetes. A nurse picks one chart at random. What is the probability the chart belongs to a diabetic patient, and what assumption makes this calculation valid?',
      reference: '3/12 = 1/4. Valid only if each of the 12 charts is equally likely to be chosen (genuinely random selection).',
    },
    hints: [
      'Write down what one outcome of the experiment looks like and how many outcomes there are in total.',
      'Probability = (number of outcomes in the event) ÷ (total number of equally likely outcomes). Count both.',
      'There are 6 × 6 = 36 ordered pairs. Sum 7 needs (1,6), (2,5), (3,4), … — continue the list, count the pairs, and divide by 36.',
    ],
  },
  teach: {
    keyIdea: 'probability equals favourable outcomes divided by total outcomes, but only when all the outcomes counted are equally likely.',
    answer: "When every outcome is equally likely, probability is just counting: the number of outcomes where the event happens, divided by the total number of outcomes. Roll two dice: there are 36 equally likely pairs, and 6 of them add to 7, so P(sum 7) = 6/36 = 1/6. The catch is the phrase 'equally likely'. If you listed the possible sums 2, 3, …, 12 and said each is 1/11, you'd be wrong, because a sum of 7 can happen six ways while a sum of 2 can happen only one way. So always count outcomes at a level where each is equally likely — usually by keeping track of each die, coin or card separately. The denominator is the total (36), never the number of unfavourable outcomes (30): that ratio is the odds, not the probability.",
  },
  items: [
    { type: 'recall', prompt: 'State the formula for the probability of an event when all outcomes are equally likely, and the condition it needs.', answer: r`$P(A) = |A| / |S|$: the number of outcomes in $A$ divided by the total number of outcomes. It requires that all outcomes in the sample space are equally likely (and that $S$ is finite).` },
    {
      type: 'apply',
      prompt: 'A fair die is rolled twice. What is the probability that the sum is at least 10?',
      answer: 'Of the 36 ordered pairs: sum 10 from (4,6), (5,5), (6,4); sum 11 from (5,6), (6,5); sum 12 from (6,6). That is 6 outcomes, so P = 6/36 = 1/6.',
      exact: '1/6',
      rubric: ['Uses 36 equally likely ordered pairs as the denominator.', 'Counts 6 favourable outcomes (3 + 2 + 1 for sums 10, 11, 12).', 'Gives 6/36 = 1/6.'],
    },
    {
      type: 'apply',
      prompt: 'A box contains 40 microchips, of which 6 are defective. One chip is selected at random. What is the probability that it is not defective?',
      answer: '40 chips are equally likely to be selected and 34 are not defective, so P = 34/40 = 17/20 = 0.85.',
      exact: '17/20',
      rubric: ['Uses 40 as the total number of equally likely outcomes.', 'Identifies 34 non-defective chips as favourable.', 'Gives 34/40 = 17/20 = 0.85.'],
    },
    {
      type: 'explain',
      prompt: "A friend argues: 'When I flip two coins there are three possibilities — two heads, one head, or no heads — so the chance of two heads is 1/3.' Explain what is wrong with this reasoning and give the correct probability.",
      answer: "The three listed results are not equally likely, so favourable/total does not apply to them. The equally likely outcomes are HH, HT, TH, TT: 'one head' happens in two of them (HT and TH), 'two heads' in one. So P(two heads) = 1/4, not 1/3. The counting formula only works when the outcomes being counted are equally likely.",
      rubric: [
        'States that the three listed results are not equally likely.',
        "Identifies the four equally likely outcomes HH, HT, TH, TT (or that 'one head' happens two ways).",
        'Gives the correct probability 1/4.',
        'States that the favourable/total formula applies only to equally likely outcomes.',
      ],
      tags: ['equiprobability-bias'],
    },
    {
      type: 'predict',
      prompt: 'Before computing: two fair dice are rolled. Which is more likely — a sum of 6 or a sum of 9? Say which and by how much, then check by counting.',
      answer: 'Sum 6 comes from (1,5), (2,4), (3,3), (4,2), (5,1): 5 ways. Sum 9 comes from (3,6), (4,5), (5,4), (6,3): 4 ways. So sum 6 is more likely: 5/36 versus 4/36.',
    },
  ],
};

export const complementRule: ConceptSpec = {
  id: 'c-complement-rule',
  name: 'The complement rule',
  definition: r`The complement $A^c$ of an event is "A does not occur"; because exactly one of $A$ and $A^c$ happens, $P(A^c) = 1 - P(A)$. It is the standard route to "at least one" probabilities.`,
  objectives: [
    ['understand', r`Explain why $P(A) + P(A^c) = 1$ using the fact that $A$ and $A^c$ are disjoint and exhaustive.`],
    ['apply', "Compute 'at least one' probabilities via the probability of 'none'."],
    ['analyze', 'Identify when the complement is the easier event to count.'],
  ],
  misconceptions: [
    {
      tag: 'at-least-one-additive',
      description: 'Computes P(at least one success in n trials) as n × p, adding the per-trial probabilities.',
      remedy: 'Ask what n × p gives for 7 rolls of a die (7/6 > 1). Then compute via P(none).',
    },
    {
      tag: 'complement-is-opposite',
      description: "Takes the complement of 'at least one head' to be 'at least one tail' or 'all heads' rather than 'no heads'.",
      remedy: 'Ask them to list the outcomes in each set and check the two sets together cover S exactly once.',
    },
  ],
  examples: [
    { title: 'At least one six in four rolls', body: r`$P(\text{no six in 4 rolls}) = (5/6)^4 = 625/1296$, so $P(\text{at least one six}) = 1 - 625/1296 = 671/1296 \approx 0.518$.`, domain: 'games' },
    { title: 'Any defective in a batch', body: r`Ten parts, each independently defective with probability 0.02: $P(\text{at least one defective}) = 1 - 0.98^{10} \approx 0.183$.`, domain: 'manufacturing' },
    { title: 'Rain on a long weekend', body: r`Independent 30% rain chance on each of 3 days: $P(\text{rain on at least one day}) = 1 - 0.7^3 = 0.657$.`, domain: 'weather' },
  ],
  script: {
    pretest: {
      prompt: 'A fair die is rolled 4 times. What is the probability of getting at least one six?',
      isomorph: 'A fair coin is flipped 5 times. What is the probability of getting at least one head?',
      reference: r`$1 - (5/6)^4 = 1 - 625/1296 = 671/1296 \approx 0.518$. (Isomorph: $1 - (1/2)^5 = 31/32$.)`,
    },
    guidingQuestions: [
      { question: "What is the complement — the exact opposite — of 'at least one six in four rolls'? Be precise.", expected: "'No six at all in the four rolls' (all four rolls are non-sixes).", probesMisconception: 'complement-is-opposite' },
      { question: 'Someone says P(at least one six) = 4 × 1/6 = 2/3. Test that idea with 7 rolls instead of 4. What goes wrong?', expected: '7 × 1/6 > 1, impossible for a probability; adding double-counts the cases with more than one six.', probesMisconception: 'at-least-one-additive' },
      { question: "How would you compute the probability of no six in four rolls? (Rolls don't influence each other.)", expected: '(5/6) × (5/6) × (5/6) × (5/6) = (5/6)^4 ≈ 0.482.' },
      { question: "And so what is P(at least one six)? Why are we allowed to subtract from 1?", expected: '1 − (5/6)^4 ≈ 0.518. Because A and its complement are mutually exclusive and together cover the whole sample space, their probabilities add to 1.' },
    ],
    workedExample: {
      problem: 'A batch of 10 parts; each part is independently defective with probability 0.02. What is the probability that the batch contains at least one defective part?',
      steps: [
        "The complement of 'at least one defective' is 'no defective parts at all'.",
        r`$P(\text{no defective}) = 0.98^{10} \approx 0.817$ (multiply the ten per-part probabilities).`,
        r`$P(\text{at least one}) = 1 - 0.817 \approx 0.183$.`,
        'Compare with the naive 10 × 0.02 = 0.20: close here, but wrong in general (for 60 parts it would give 1.2).',
      ],
    },
    transfer: {
      prompt: 'A forecast gives an independent 30% chance of rain on each of the 3 days of a festival. What is the probability that it rains on at least one day?',
      reference: r`$1 - 0.7^3 = 1 - 0.343 = 0.657$.`,
    },
    hints: [
      "'At least one' is hard to count directly; think about what would have to happen for it NOT to occur.",
      'Compute the probability of the complement (no successes at all), then subtract it from 1.',
      'P(no six on one roll) = 5/6. For four rolls that do not affect each other, multiply: (5/6)(5/6)(5/6)(5/6) = 625/1296. Now apply the complement rule.',
    ],
  },
  teach: {
    keyIdea: "P(A) + P(not A) = 1, so 'at least one' is computed as 1 minus the probability of 'none'.",
    answer: "Every event has a complement: 'A doesn't happen'. Since exactly one of the two must occur, their probabilities add to 1, so P(not A) = 1 − P(A). This is most useful for 'at least one' questions, which are messy to count directly because 'at least one' includes one, two, three… successes. Its complement, 'none', is easy. Example: roll a die four times; P(at least one six)? P(no six on a roll) = 5/6, so P(no six in four rolls) = (5/6)^4 ≈ 0.482, and P(at least one six) = 1 − 0.482 ≈ 0.518. A tempting wrong answer is 4 × 1/6 = 2/3; you can see it's wrong because with 7 rolls it would give 7/6, more than 1. Also be careful to name the complement precisely: the opposite of 'at least one six' is 'no sixes', not 'all sixes'.",
  },
  items: [
    { type: 'recall', prompt: "State the complement rule, and say what the complement of 'at least one' is.", answer: r`$P(A^c) = 1 - P(A)$, because $A$ and $A^c$ are disjoint and together make up the whole sample space. The complement of 'at least one' is 'none at all'.` },
    {
      type: 'apply',
      prompt: 'A fair coin is flipped 6 times. What is the probability of at least one tail?',
      answer: r`P(no tail) = P(all heads) = $(1/2)^6 = 1/64$, so P(at least one tail) = $1 - 1/64 = 63/64 \approx 0.984$.`,
      exact: '63/64',
      rubric: ["Identifies the complement as 'all six flips are heads'.", 'Computes P(all heads) = (1/2)^6 = 1/64.', 'Gives 1 − 1/64 = 63/64.'],
    },
    {
      type: 'apply',
      prompt: 'Each of 5 sensors on a machine independently fails a daily self-test with probability 0.1. What is the probability that at least one sensor fails today?',
      answer: r`P(no sensor fails) = $0.9^5 = 0.59049$, so P(at least one fails) = $1 - 0.59049 = 0.40951 \approx 0.41$.`,
      exact: '0.4095',
      notes: 'Accept 0.41 or 0.410.',
      rubric: ["Identifies the complement 'no sensor fails'.", 'Computes 0.9^5 ≈ 0.590.', 'Gives 1 − 0.9^5 ≈ 0.41.'],
    },
    {
      type: 'explain',
      prompt: r`Explain why $P(\text{at least one six in 4 rolls})$ is not $4 \times \tfrac{1}{6}$, and describe the correct method.`,
      answer: r`Adding 1/6 four times double-counts the outcomes with two or more sixes (and for 7 or more rolls it would exceed 1, which is impossible). The correct method uses the complement: the opposite of 'at least one six' is 'no six in any roll', which has probability $(5/6)^4 = 625/1296 \approx 0.482$ because the rolls are independent. Therefore $P(\text{at least one six}) = 1 - (5/6)^4 = 671/1296 \approx 0.518$.`,
      rubric: [
        'Explains that adding per-roll probabilities double-counts outcomes with more than one six (or leads to probabilities above 1 for enough rolls).',
        "Identifies the complement as 'no six in any of the four rolls'.",
        'Computes the complement probability as (5/6)^4.',
        'Gives the final answer 1 − (5/6)^4 ≈ 0.52.',
      ],
      tags: ['at-least-one-additive'],
    },
    { type: 'cloze', prompt: r`If $P(A) = 0.35$ then $P(A^c) = $ ____, because $A$ and $A^c$ are ____ (cannot both happen) and ____ (together they cover the whole sample space).`, answer: '0.65; mutually exclusive (disjoint); exhaustive.' },
  ],
};

export const multiplicationPrinciple: ConceptSpec = {
  id: 'c-multiplication-principle',
  name: 'The multiplication principle',
  definition: r`If a task consists of $k$ successive choices with $n_1, n_2, \dots, n_k$ options respectively, there are $n_1 n_2 \cdots n_k$ ways to complete it — provided the *number* of options at each stage does not depend on which earlier choices were made.`,
  objectives: [
    ['understand', 'Explain, with a tree diagram, why the numbers of options at successive stages multiply.'],
    ['apply', 'Count outfits, PINs, licence plates and menus, with and without repetition.'],
    ['analyze', "Decide whether a counting situation calls for multiplying ('and') or adding ('or')."],
  ],
  misconceptions: [
    {
      tag: 'adds-instead-of-multiplies',
      description: 'Adds the numbers of options for successive stages (3 shirts and 4 trousers gives 7 outfits).',
      remedy: 'Draw the tree for 2 shirts × 3 trousers and count the leaves; ask what each leaf represents.',
    },
    {
      tag: 'ignores-dependence-of-stages',
      description: 'Uses the same option count at every stage even when earlier choices remove options (e.g. digits that must differ).',
      remedy: "Ask 'after the first digit is chosen, how many digits are still available for the second position?'",
    },
  ],
  examples: [
    { title: 'Three-course meal', body: r`3 starters, 4 mains, 2 desserts: $3 \times 4 \times 2 = 24$ different meals.`, domain: 'everyday' },
    { title: 'Licence plates', body: r`Two letters then three digits with repetition allowed: $26^2 \times 10^3 = 676{,}000$ plates.`, domain: 'transport' },
    { title: 'Treatment plans', body: r`One of 3 drugs, one of 2 doses, one of 4 schedules: $3 \times 2 \times 4 = 24$ possible plans.`, domain: 'medicine' },
  ],
  script: {
    pretest: {
      prompt: 'A café offers 3 starters, 4 mains and 2 desserts. How many different three-course meals (one of each) are possible?',
      isomorph: 'A PIN has 4 digits, each from 0–9. How many PINs are there? How many if no digit may repeat?',
      reference: r`$3 \times 4 \times 2 = 24$. (Isomorph: $10^4 = 10{,}000$; without repetition $10 \times 9 \times 8 \times 7 = 5040$.)`,
    },
    guidingQuestions: [
      { question: 'Suppose there were just 2 starters (S1, S2) and 3 mains (M1, M2, M3). Can you list every possible (starter, main) pair?', expected: 'Six pairs: S1M1, S1M2, S1M3, S2M1, S2M2, S2M3.' },
      { question: 'You listed 6, not 5. Why is it 2 × 3 rather than 2 + 3?', expected: 'Each starter can be paired with every main, so there are 3 pairs for each of the 2 starters: a tree with 2 branches, each splitting into 3.', probesMisconception: 'adds-instead-of-multiplies' },
      { question: 'Now add 2 desserts. For each of those 6 starter–main pairs, how many ways can the meal be finished? So how many meals?', expected: '2 ways each, giving 6 × 2 = 12 meals.' },
      { question: 'When would this multiplying trick need care? Think about choosing a 2-digit code where the digits must differ.', expected: 'The second stage has only 9 options because one digit is used up: 10 × 9 = 90, not 10 × 10. The principle still applies as long as the number of options at each stage is fixed.', probesMisconception: 'ignores-dependence-of-stages' },
    ],
    workedExample: {
      problem: 'How many licence plates of the form LLDDD (two letters then three digits) are there, if letters may repeat but the three digits must all be different?',
      steps: [
        r`Letters: 26 choices for each position, so $26 \times 26 = 676$.`,
        r`Digits must differ: 10 choices, then 9, then 8, so $10 \times 9 \times 8 = 720$.`,
        r`Total plates: $676 \times 720 = 486{,}720$.`,
      ],
    },
    transfer: {
      prompt: 'A clinic designs treatment plans by choosing one of 3 drugs, one of 2 doses and one of 4 schedules. How many plans are possible? If drug C is available in only one dose, how many plans are possible then?',
      reference: r`$3 \times 2 \times 4 = 24$. With drug C in one dose only: drugs A or B give $2 \times 2 \times 4 = 16$, drug C gives $1 \times 1 \times 4 = 4$, total 20 (multiply within each branch, add the branches).`,
    },
    hints: [
      'Think of building the meal one course at a time. For each starter, how many ways can the rest of the meal go?',
      'Draw a tree: one branch per option at each stage. The number of leaves is the product of the branch counts.',
      '3 starters; for each, 4 mains, giving 12 starter–main pairs. For each of those 12 pairs, how many desserts? Multiply once more.',
    ],
  },
  teach: {
    keyIdea: 'the number of ways to complete a sequence of choices is the product of the number of options at each stage.',
    answer: "When a task is done in stages and each stage has a fixed number of options, you multiply the numbers of options. Picture a tree: 3 starters means 3 branches; each branch splits into 4 mains, so 12 twigs; each twig splits into 2 desserts, so 24 leaves. Each leaf is one complete meal. People sometimes add instead (3 + 4 + 2 = 9), but adding is for 'either/or' situations — for example, if you could order just one course, a starter or a main or a dessert, there'd be 9 options. 'And' multiplies, 'or' adds. One subtlety: if an earlier choice uses up options, count what's actually available at each stage — a 4-digit PIN with no repeated digit has 10 × 9 × 8 × 7 = 5040 possibilities, not 10^4.",
  },
  items: [
    { type: 'recall', prompt: 'State the multiplication principle of counting, including the condition under which it applies.', answer: 'If a task has k successive stages with n1, n2, …, nk options, the task can be done in n1 × n2 × … × nk ways, provided the number of options at each stage is the same regardless of the earlier choices.' },
    {
      type: 'apply',
      prompt: 'A password consists of 3 letters (a–z) followed by 2 digits (0–9), with repetition allowed. How many passwords are there?',
      answer: r`$26^3 \times 10^2 = 17{,}576 \times 100 = 1{,}757{,}600$.`,
      exact: '1757600',
      rubric: ['Uses 26 options for each letter position and 10 for each digit position.', 'Multiplies the five stage counts.', 'Gives 1,757,600.'],
    },
    {
      type: 'apply',
      prompt: 'A survey asks 5 yes/no questions. How many different response patterns are possible? A sixth question with 4 options is added — how many patterns then?',
      answer: r`$2^5 = 32$ patterns; with the sixth question, $32 \times 4 = 128$.`,
      exact: '32; 128',
      rubric: ['Gives 2^5 = 32 for the five yes/no questions.', 'Multiplies by 4 for the extra question.', 'Gives 128.'],
    },
    {
      type: 'explain',
      prompt: 'A student says that with 3 shirts and 4 pairs of trousers there are 3 + 4 = 7 outfits. Explain why the correct answer is 12 and how a tree diagram shows it.',
      answer: 'An outfit needs a shirt AND a pair of trousers. Each of the 3 shirts can be worn with any of the 4 pairs of trousers, so there are 4 outfits per shirt and 3 × 4 = 12 in total. A tree makes this visible: 3 branches for the shirts, each splitting into 4 branches for the trousers, giving 12 leaves, one per outfit. Adding (3 + 4 = 7) would be right only for a different question: choosing a single item that is either a shirt or a pair of trousers.',
      rubric: [
        'States that each shirt can be paired with every pair of trousers.',
        'Gives 12 = 3 × 4.',
        'Describes the tree: 3 branches, each splitting into 4, giving 12 leaves.',
        "States when addition would be correct (choosing one item that is either a shirt or trousers — mutually exclusive alternatives).",
      ],
      tags: ['adds-instead-of-multiplies'],
    },
    {
      type: 'discriminate',
      prompt: 'When counting, when do you multiply and when do you add? Give one concrete example of each.',
      answer: "Multiply when a task is completed by making several choices in sequence — 'this AND then that' — with a fixed number of options at each stage (e.g. 3 starters × 4 mains = 12 meals). Add when you are choosing one alternative from mutually exclusive categories — 'this OR that' (e.g. a snack that is one of 3 fruits or one of 4 pastries: 3 + 4 = 7 choices).",
      rubric: [
        "States that multiplication is for successive stages of one task ('and').",
        "States that addition is for mutually exclusive alternatives ('or').",
        'Gives a correct example of each.',
      ],
    },
  ],
};

export const permutations: ConceptSpec = {
  id: 'c-permutations',
  name: 'Permutations',
  definition: r`A permutation is an ordered arrangement of distinct objects. The number of ways to arrange $r$ objects chosen from $n$ distinct objects in order is $P(n,r) = \frac{n!}{(n-r)!} = n(n-1)\cdots(n-r+1)$; arranging all $n$ gives $n!$.`,
  objectives: [
    ['remember', r`State $n!$ and $P(n,r)$ and what each counts.`],
    ['apply', 'Count rankings, seatings, ordered draws and arrangements with restrictions.'],
    ['analyze', "Recognise 'order matters' cues in a problem statement."],
  ],
  misconceptions: [
    {
      tag: 'factorial-for-partial-arrangements',
      description: 'Uses n! when only r of the n objects are being arranged.',
      remedy: 'Fill the positions one at a time with the multiplication principle: n, then n − 1, … and stop after r factors.',
    },
    {
      tag: 'permutation-when-order-irrelevant',
      description: "Uses permutations for selections where order doesn't matter (committees, hands, samples).",
      remedy: 'Ask whether swapping two chosen items produces a different outcome. If not, it is a combination.',
    },
  ],
  examples: [
    { title: 'Podium', body: r`8 runners; gold, silver and bronze can be awarded in $8 \times 7 \times 6 = 336$ ways.`, domain: 'sports' },
    { title: 'Appointment slots', body: r`Scheduling 4 of 10 patients into the four morning slots: $10 \times 9 \times 8 \times 7 = 5040$ ways.`, domain: 'medicine' },
    { title: 'Books with a constraint', body: r`5 books on a shelf: $5! = 120$ orders. If two particular books must sit together, treat them as a block: $4! \times 2 = 48$.`, domain: 'everyday' },
  ],
  script: {
    pretest: {
      prompt: 'Eight runners compete in a race. How many different gold–silver–bronze podiums are possible?',
      isomorph: 'In how many ways can 4 of 10 patients be scheduled into the four morning appointment slots (one patient per slot)?',
      reference: r`$8 \times 7 \times 6 = 336$. (Isomorph: $10 \times 9 \times 8 \times 7 = 5040$.)`,
    },
    guidingQuestions: [
      { question: 'How many runners could take gold? Once gold is decided, how many could take silver? And bronze?', expected: '8, then 7, then 6.' },
      { question: 'Why does the answer not involve 8! = 40,320?', expected: 'Only three places are filled; 8! would arrange all eight runners, including places 4–8 that we do not care about.', probesMisconception: 'factorial-for-partial-arrangements' },
      { question: 'Is the podium (A gold, B silver, C bronze) the same as (B gold, A silver, C bronze)? What does that tell you about whether order matters here?', expected: 'They are different podiums, so order matters — this is a permutation, not a selection.', probesMisconception: 'permutation-when-order-irrelevant' },
      { question: 'Can you write 8 × 7 × 6 using factorials?', expected: '8!/5! = 8!/(8−3)!.' },
    ],
    workedExample: {
      problem: 'In how many ways can 5 different books be arranged on a shelf? In how many ways if two particular books must be next to each other?',
      steps: [
        r`All 5 books: $5! = 120$ arrangements.`,
        'Two books must be adjacent: glue them into one block, so there are 4 objects to arrange: 4! = 24 ways.',
        r`The two books inside the block can be ordered in 2 ways, so $24 \times 2 = 48$ arrangements.`,
      ],
    },
    transfer: {
      prompt: 'A factory must assign 3 different jobs (welding, painting, packing) to 3 of its 7 idle machines, one job per machine. How many assignments are possible?',
      reference: r`$7 \times 6 \times 5 = 210$ (the jobs are distinct, so which machine gets which job matters).`,
    },
    hints: [
      'Fill the positions one at a time. How many candidates are there for the first position?',
      'Use the multiplication principle: the number of candidates drops by one at each position; stop when all positions are filled.',
      'Gold: 8 choices. Silver: 7 remaining. Bronze: ? Multiply the three numbers.',
    ],
  },
  teach: {
    keyIdea: 'an ordered arrangement of r objects out of n distinct ones can be made in n(n−1)…(n−r+1) = n!/(n−r)! ways.',
    answer: "A permutation is an arrangement where order matters. Think of filling positions one by one: for a podium with 8 runners, 8 could take gold, then 7 are left for silver, then 6 for bronze, so 8 × 7 × 6 = 336 podiums. That's the multiplication principle with a shrinking count. In factorial notation it's 8!/5!, and arranging all n objects gives n!. The usual mistake is writing 8! when only three places are awarded — 8! would order all eight runners. The other important check is whether order matters at all: a podium does (A gold, B silver differs from B gold, A silver), but a committee of three doesn't, and then you need combinations, which we meet next.",
  },
  items: [
    { type: 'recall', prompt: r`What is $P(n,r)$, in words and as a formula? What is $0!$?`, answer: r`$P(n,r)$ is the number of ordered arrangements of $r$ objects chosen from $n$ distinct objects: $P(n,r) = n!/(n-r)! = n(n-1)\cdots(n-r+1)$. By convention $0! = 1$.` },
    {
      type: 'apply',
      prompt: 'A committee of 12 people must elect a chair, a secretary and a treasurer (three different people). How many outcomes are there?',
      answer: r`$12 \times 11 \times 10 = 1320$ (the roles are distinct, so order matters).`,
      exact: '1320',
      rubric: ['Recognises that order matters because the roles differ.', 'Uses 12 × 11 × 10.', 'Gives 1320.'],
    },
    {
      type: 'apply',
      prompt: 'How many distinct arrangements of the six letters of the word PLANET are there? How many of them start with a vowel?',
      answer: r`All letters are distinct, so $6! = 720$ arrangements. Starting with a vowel (A or E): 2 choices for the first letter, then $5! = 120$ for the rest: $2 \times 120 = 240$.`,
      exact: '720; 240',
      rubric: ['Gives 6! = 720 for all arrangements.', 'Counts 2 choices of vowel for the first position and 5! for the remaining letters.', 'Gives 240.'],
    },
    {
      type: 'explain',
      prompt: r`Explain why the number of ways to award gold, silver and bronze among 8 runners is $8 \times 7 \times 6$ and not $8!$ or $8^3$.`,
      answer: r`Fill the three places in order: 8 runners could take gold; once gold is taken, 7 remain for silver; then 6 for bronze. By the multiplication principle that is $8 \times 7 \times 6 = 336$. $8!$ would arrange all eight runners in a full finishing order, which counts distinctions among places 4–8 that the podium ignores. $8^3$ would allow the same runner to occupy more than one place, which is impossible.`,
      rubric: [
        'Explains the 8, 7, 6 choices as runners being used up position by position.',
        'States that 8! counts full orderings of all eight runners (positions 4–8 are irrelevant).',
        'States that 8^3 would allow the same runner in more than one place.',
        'Gives the result 336.',
      ],
      tags: ['factorial-for-partial-arrangements'],
    },
    {
      type: 'discriminate',
      prompt: 'How does a permutation differ from a combination? Give one problem where each is the right tool, and say what cue in the wording tells you which to use.',
      answer: r`A permutation counts ordered arrangements; a combination counts unordered selections. Each combination of $r$ items corresponds to $r!$ permutations, so $\binom{n}{r} = P(n,r)/r!$. Permutation example: awarding gold, silver, bronze to 3 of 8 runners ($8 \times 7 \times 6 = 336$). Combination example: choosing 3 of 8 runners for a relay team with no roles ($\binom{8}{3} = 56$). Cues: words like arrange, rank, sequence, order, first/second, distinct roles signal permutations; choose, select, committee, hand, sample, group signal combinations.`,
      rubric: [
        "States that permutations count ordered arrangements and combinations count unordered selections.",
        'States the relation C(n,r) = P(n,r)/r! (or that each combination corresponds to r! permutations).',
        'Gives a correct example of each.',
        "Names a wording cue for each (e.g. 'rank/arrange' vs 'choose/committee').",
      ],
      tags: ['permutation-vs-combination'],
    },
  ],
};

export const combinations: ConceptSpec = {
  id: 'c-combinations',
  name: 'Combinations',
  definition: r`A combination is a selection of $r$ objects from $n$ distinct objects in which order does not matter. There are $\binom{n}{r} = \frac{n!}{r!\,(n-r)!}$ such selections.`,
  objectives: [
    ['understand', r`Explain why $\binom{n}{r} = P(n,r)/r!$: every unordered selection corresponds to $r!$ orderings.`],
    ['apply', 'Compute binomial coefficients for committees, hands and inspection samples, including selections with a required subgroup.'],
    ['analyze', r`Use the symmetry $\binom{n}{r} = \binom{n}{n-r}$ and decide between permutations and combinations.`],
  ],
  misconceptions: [
    {
      tag: 'forgets-to-divide-by-r-factorial',
      description: 'Uses P(n,r) for an unordered selection, counting each group r! times.',
      remedy: 'Take n = 3, r = 2: list the selections {AB, AC, BC} (3) against the ordered pairs (6) and ask why the factor is 2.',
    },
    {
      tag: 'chooses-with-replacement',
      description: 'Treats a selection as if the same object could be chosen more than once (uses n^r).',
      remedy: 'Ask whether the same person can be on the committee twice.',
    },
  ],
  examples: [
    { title: 'Committee', body: r`3 people from 10: $\binom{10}{3} = 120$.`, domain: 'workplace' },
    { title: 'Poker hands', body: r`5 cards from 52: $\binom{52}{5} = 2{,}598{,}960$. Hands with exactly 2 aces: $\binom{4}{2}\binom{48}{3} = 6 \times 17{,}296 = 103{,}776$.`, domain: 'games' },
    { title: 'Inspection sample', body: r`An inspector picks 4 of 20 parts to test: $\binom{20}{4} = 4845$ possible samples.`, domain: 'manufacturing' },
  ],
  script: {
    pretest: {
      prompt: 'How many different 3-person committees can be formed from 10 people?',
      isomorph: 'In how many ways can an inspector choose 4 parts to test from a lot of 20?',
      reference: r`$\binom{10}{3} = 120$. (Isomorph: $\binom{20}{4} = 4845$.)`,
    },
    guidingQuestions: [
      { question: 'If instead we chose a chair, then a secretary, then a treasurer from the 10, how many ways would that be? Is a committee the same kind of thing?', expected: '10 × 9 × 8 = 720. A committee has no roles, so many of those 720 outcomes are the same committee.' },
      { question: 'How many of those 720 ordered outcomes correspond to the single committee {A, B, C}?', expected: '3! = 6 (ABC, ACB, BAC, BCA, CAB, CBA).', probesMisconception: 'forgets-to-divide-by-r-factorial' },
      { question: 'So how many committees are there?', expected: '720 / 6 = 120.' },
      { question: r`Without computing, why must $\binom{10}{3} = \binom{10}{7}$?`, expected: 'Choosing which 3 to include is the same as choosing which 7 to leave out.' },
      { question: 'Could the answer be 10^3 = 1000? What would that count?', expected: 'No: 10^3 lets the same person be chosen repeatedly and counts order; a committee has three distinct people.', probesMisconception: 'chooses-with-replacement' },
    ],
    workedExample: {
      problem: 'How many 5-card hands can be dealt from a 52-card deck? How many of them contain exactly 2 aces?',
      steps: [
        r`A hand is an unordered selection: $\binom{52}{5} = 2{,}598{,}960$.`,
        r`Exactly 2 aces: choose the 2 aces from the 4, $\binom{4}{2} = 6$; choose the other 3 cards from the 48 non-aces, $\binom{48}{3} = 17{,}296$.`,
        r`Multiply (aces AND non-aces): $6 \times 17{,}296 = 103{,}776$ hands.`,
      ],
    },
    transfer: {
      prompt: 'A lottery draws 6 numbers from 1–49 without regard to order. How many possible draws are there, and what is the probability that a single ticket wins?',
      reference: r`$\binom{49}{6} = 13{,}983{,}816$ draws, so one ticket wins with probability $1/13{,}983{,}816 \approx 7.2 \times 10^{-8}$.`,
    },
    hints: [
      'Does swapping two members of a chosen group produce a different group? That decides whether order should be counted.',
      'Count the ordered selections first, then divide by the number of ways the chosen group can be ordered.',
      'Ordered selections: 10 × 9 × 8 = 720. Each committee of 3 was counted 3! = 6 times in that figure. Divide.',
    ],
  },
  teach: {
    keyIdea: 'the number of unordered selections of r objects from n is n!/(r!(n−r)!), which is the number of ordered arrangements divided by r!.',
    answer: "A combination is a selection where order doesn't matter — a committee, a hand of cards, a sample of parts. To count them, first count ordered selections and then remove the overcounting. For 3 people from 10: ordered, there are 10 × 9 × 8 = 720 ways, but each committee {A, B, C} appears 3! = 6 times in that count (ABC, ACB, …), so there are 720/6 = 120 committees. That's the formula C(n, r) = n!/(r!(n−r)!). A quick sanity check: C(10, 3) = C(10, 7), because picking 3 to include is the same as picking 7 to leave out. The classic error is forgetting to divide by r! — you'll notice it if your 'committees' count exceeds your 'ordered lists' count divided by anything sensible, or simply by listing a tiny case like choosing 2 of {A, B, C}: AB, AC, BC — three, not six.",
  },
  items: [
    { type: 'recall', prompt: r`State the formula for $\binom{n}{r}$ and what it counts.`, answer: r`$\binom{n}{r} = \frac{n!}{r!(n-r)!}$ counts the number of ways to choose an unordered set of $r$ objects from $n$ distinct objects.` },
    {
      type: 'apply',
      prompt: 'An inspector must choose 3 of 12 machines to audit. How many choices are there? If 2 particular machines must both be included, how many choices are there then?',
      answer: r`$\binom{12}{3} = 220$. If two specific machines must be included, only the third is free: choose 1 of the remaining 10, so 10 choices.`,
      exact: '220; 10',
      rubric: ['Gives C(12,3) = 220.', 'Recognises that with two machines fixed only one further machine is chosen from 10.', 'Gives 10.'],
    },
    {
      type: 'apply',
      prompt: 'How many 5-card hands from a standard 52-card deck contain exactly 3 hearts?',
      answer: r`Choose 3 of the 13 hearts and 2 of the 39 non-hearts: $\binom{13}{3} \times \binom{39}{2} = 286 \times 741 = 211{,}926$.`,
      exact: '211926',
      rubric: ['Chooses 3 hearts from 13 (C(13,3) = 286).', 'Chooses 2 non-hearts from 39 (C(39,2) = 741).', 'Multiplies to get 211,926.'],
    },
    {
      type: 'explain',
      prompt: r`Using the example of choosing 2 people from {A, B, C, D}, explain why the number of combinations equals the number of permutations divided by $r!$.`,
      answer: r`Ordered choices of 2 from 4: $4 \times 3 = 12$ (AB, BA, AC, CA, AD, DA, BC, CB, BD, DB, CD, DC). Each unordered pair appears twice in that list — AB and BA are the same pair — so the 12 ordered choices collapse into $12 / 2 = 6$ combinations: AB, AC, AD, BC, BD, CD. In general each unordered selection of $r$ objects can be written in $r!$ orders, so every combination is counted $r!$ times among the permutations, and $\binom{n}{r} = P(n,r)/r!$.`,
      rubric: [
        'Lists or counts 12 ordered pairs.',
        'Notes that each unordered pair appears 2! = 2 times (AB and BA).',
        'Concludes there are 12 / 2 = 6 combinations.',
        'Generalises: each combination of r items corresponds to r! orderings.',
      ],
      tags: ['forgets-to-divide-by-r-factorial'],
    },
    { type: 'cloze', prompt: r`$\binom{n}{r} = \binom{n}{\_\_\_\_}$, because choosing which $r$ objects to include is the same as choosing which ____ objects to leave out.`, answer: 'n − r; n − r' },
    {
      type: 'predict',
      prompt: r`Before calculating: which is larger, $\binom{20}{2}$ or $\binom{20}{18}$? And is $\binom{20}{10}$ larger or smaller than both?`,
      answer: r`They are equal: $\binom{20}{2} = \binom{20}{18} = 190$ by symmetry. $\binom{20}{10} = 184{,}756$ is far larger — binomial coefficients are largest in the middle.`,
    },
  ],
};

export const countingProbability: ConceptSpec = {
  id: 'c-counting-probability',
  name: 'Probability by counting',
  definition: r`When outcomes are equally likely, probabilities are ratios of counts, so the counting tools (multiplication principle, permutations, combinations) give $P(A) = |A|/|S|$ for hands, lotteries, samples and arrangements — as long as numerator and denominator count the same kind of object.`,
  objectives: [
    ['apply', 'Compute probabilities of hands, inspection samples and seatings using combinations or sequential products.'],
    ['analyze', 'Keep numerator and denominator consistent (both ordered or both unordered) and diagnose mixed counts.'],
    ['understand', "Explain complement-based counting arguments such as the birthday problem's 'all different' event."],
  ],
  misconceptions: [
    {
      tag: 'mixed-ordered-unordered',
      description: 'Counts the numerator as ordered sequences and the denominator as unordered sets (or vice versa), often producing a probability above 1.',
      remedy: 'Ask: does the denominator count the same kind of object as the numerator? Redo both as combinations, or both as ordered draws.',
    },
    {
      tag: 'specific-vs-any',
      description: "Confuses the probability of a specific outcome type (a pair of aces) with any outcome of that type (any pair).",
      remedy: "Ask 'a pair of which rank?' and show that 'any pair' sums over the 13 ranks.",
    },
  ],
  examples: [
    { title: 'Flush', body: r`5 cards all of one suit: $4 \binom{13}{5} / \binom{52}{5} = 5148 / 2{,}598{,}960 \approx 0.0020$, about 1 in 505.`, domain: 'games' },
    { title: 'Clean sample', body: r`A lot of 20 parts has 4 defective; 3 are sampled. $P(\text{no defective}) = \binom{16}{3}/\binom{20}{3} = 560/1140 = 28/57 \approx 0.49$.`, domain: 'manufacturing' },
    { title: 'Birthday problem', body: r`23 people: $P(\text{all birthdays differ}) = \frac{365 \times 364 \times \cdots \times 343}{365^{23}} \approx 0.493$, so a shared birthday has probability about $0.507$.`, domain: 'social' },
  ],
  script: {
    pretest: {
      prompt: 'A lot of 20 parts contains 4 defective ones. An inspector selects 3 parts at random without replacement. What is the probability that none of them is defective?',
      isomorph: 'A bag holds 10 red and 5 blue marbles. Three marbles are drawn at random without replacement. What is the probability that all three are red?',
      reference: r`$\binom{16}{3}/\binom{20}{3} = 560/1140 = 28/57 \approx 0.491$. (Isomorph: $\binom{10}{3}/\binom{15}{3} = 120/455 = 24/91 \approx 0.264$.)`,
    },
    guidingQuestions: [
      { question: 'What are the equally likely outcomes here: ordered triples of parts, or unordered sets of 3 parts? Does the choice matter?', expected: 'Either works as long as numerator and denominator use the same convention; unordered sets are simplest here.' },
      { question: 'How many ways can 3 parts be chosen from the 20? How many ways can 3 be chosen from the 16 good ones?', expected: 'C(20,3) = 1140 and C(16,3) = 560.' },
      { question: 'A learner computed 16 × 15 × 14 for the numerator and C(20,3) for the denominator, getting 3360/1140 > 1. What went wrong?', expected: 'The numerator counts ordered draws and the denominator unordered sets; they must match. 3360/(20 × 19 × 18) gives the right answer too.', probesMisconception: 'mixed-ordered-unordered' },
      { question: 'Can you get the same answer by multiplying step-by-step probabilities for each draw?', expected: '16/20 × 15/19 × 14/18 = 3360/6840 = 28/57, the same.' },
    ],
    workedExample: {
      problem: 'What is the probability that a 5-card hand from a standard deck is a flush — all five cards of the same suit?',
      steps: [
        r`Total hands (unordered): $\binom{52}{5} = 2{,}598{,}960$.`,
        r`Favourable: choose the suit (4 ways) and then 5 of that suit's 13 cards, $\binom{13}{5} = 1287$: $4 \times 1287 = 5148$ hands.`,
        r`$P(\text{flush}) = 5148 / 2{,}598{,}960 \approx 0.00198$, roughly 1 in 505.`,
      ],
    },
    transfer: {
      prompt: 'In a room of 23 people, what is the probability that at least two share a birthday (assume 365 equally likely days)? Set the calculation up with the complement and explain the structure; you need not finish the arithmetic.',
      reference: r`Complement: all 23 birthdays differ. Ordered assignments of days: $365^{23}$ in total; all-different assignments: $365 \times 364 \times \cdots \times 343$. So $P(\text{all different}) = 365 \times 364 \times \cdots \times 343 / 365^{23} \approx 0.493$ and $P(\text{at least one shared}) \approx 0.507$. Both counts are ordered (person 1, person 2, …), which keeps them consistent.`,
    },
    hints: [
      'Decide what a single equally likely outcome is (which 3 parts were picked), then count the good outcomes and all outcomes in the same way.',
      'Use combinations: the denominator is the number of ways to pick 3 parts from 20; the numerator picks 3 from the good parts only.',
      'C(20,3) = 1140. There are 16 good parts, so the numerator is C(16,3) = 16 · 15 · 14 / 6. Compute it and divide.',
    ],
  },
  teach: {
    keyIdea: 'with equally likely outcomes, probability = (count of favourable outcomes)/(count of all outcomes), with both counts done the same way (both ordered or both unordered).',
    answer: "Once you can count, you can compute probabilities of complicated events, as long as outcomes are equally likely: probability = favourable count ÷ total count. Example: a lot of 20 parts with 4 defective, inspector draws 3. Total ways to pick 3 parts: C(20,3) = 1140. Ways to pick 3 good parts from the 16 good ones: C(16,3) = 560. So P(no defective) = 560/1140 ≈ 0.49. You could also count ordered draws — 16·15·14 over 20·19·18 — and you'd get the same answer. What you must not do is mix: ordered on top and unordered underneath gives 3360/1140, which is bigger than 1, a sure sign something is wrong. Another trap: 'probability of a pair of aces' is not 'probability of a pair'; the second is 13 times the first because it sums over all ranks.",
  },
  items: [
    {
      type: 'apply',
      prompt: 'A shipment has 25 phones, 5 of them faulty. A customer buys 2 at random. What is the probability that both are faulty?',
      answer: r`$\binom{5}{2}/\binom{25}{2} = 10/300 = 1/30 \approx 0.033$. Equivalently $\frac{5}{25} \times \frac{4}{24} = 1/30$.`,
      exact: '1/30',
      rubric: ['Counts total selections C(25,2) = 300 (or uses sequential probabilities 5/25 × 4/24).', 'Counts favourable selections C(5,2) = 10 (or the matching sequential numerator).', 'Gives 1/30.'],
    },
    {
      type: 'apply',
      prompt: 'Five people, including Ana and Ben, sit in a row of 5 seats in random order. What is the probability that Ana and Ben sit next to each other?',
      answer: r`Total orders: $5! = 120$. Favourable: treat Ana–Ben as a block, giving $4! = 24$ orders, times 2 for the order inside the block: 48. $P = 48/120 = 2/5$.`,
      exact: '2/5',
      rubric: ['Uses 5! = 120 equally likely seatings.', 'Counts 4! × 2 = 48 seatings with the pair adjacent.', 'Gives 48/120 = 2/5.'],
    },
    {
      type: 'apply',
      prompt: 'What is the probability that a 5-card hand from a standard deck contains all four aces?',
      answer: r`All four aces plus any one of the other 48 cards: 48 favourable hands. $P = 48/\binom{52}{5} = 48/2{,}598{,}960 = 1/54{,}145 \approx 1.8 \times 10^{-5}$.`,
      exact: '1/54145',
      rubric: ['Uses C(52,5) = 2,598,960 as the denominator.', 'Counts 48 favourable hands (the four aces plus one of 48 other cards).', 'Gives 1/54,145 (≈ 1.85 × 10^-5).'],
    },
    {
      type: 'explain',
      prompt: r`A student computes the probability that 3 parts chosen from 20 (16 good, 4 defective) are all good as $\frac{16 \times 15 \times 14}{\binom{20}{3}}$ and gets a number greater than 1. Explain the error and show two correct ways to set up the calculation.`,
      answer: r`The numerator $16 \times 15 \times 14 = 3360$ counts ordered draws, while the denominator $\binom{20}{3} = 1140$ counts unordered sets, so the two counts are inconsistent. Correct unordered version: $\binom{16}{3}/\binom{20}{3} = 560/1140$. Correct ordered version: $\frac{16 \times 15 \times 14}{20 \times 19 \times 18} = 3360/6840$, or equivalently the sequential product $\frac{16}{20}\cdot\frac{15}{19}\cdot\frac{14}{18}$. Both give $28/57 \approx 0.49$.`,
      rubric: [
        'Identifies that the numerator is an ordered count and the denominator an unordered count.',
        'Gives the correct unordered set-up C(16,3)/C(20,3).',
        'Gives the correct ordered or sequential set-up (16·15·14)/(20·19·18) or 16/20 · 15/19 · 14/18.',
        'States the answer 28/57 ≈ 0.49.',
      ],
      tags: ['mixed-ordered-unordered'],
    },
    {
      type: 'discriminate',
      prompt: "What is the difference between 'the probability that a 2-card hand is a pair of aces' and 'the probability that a 2-card hand is a pair (any rank)'? Compute both.",
      answer: r`Total 2-card hands: $\binom{52}{2} = 1326$. A pair of aces: $\binom{4}{2} = 6$ hands, so $6/1326 = 1/221 \approx 0.0045$. Any pair: 13 ranks, each with $\binom{4}{2} = 6$ pairs, so $78/1326 = 1/17 \approx 0.059$. The second event is the union over the 13 ranks of events like the first, so it is 13 times as likely.`,
      rubric: [
        'Computes P(pair of aces) = 6/1326 = 1/221.',
        'Computes P(any pair) = 78/1326 = 1/17.',
        'Explains that the second sums over the 13 possible ranks (any rank vs a specific rank).',
      ],
      tags: ['specific-vs-any'],
    },
    { type: 'cloze', prompt: r`When outcomes are equally likely, the numerator and denominator of $P(A) = |A|/|S|$ must count the same kind of object: either both count ____ selections or both count ____ selections.`, answer: 'ordered; unordered (in either order)' },
  ],
};

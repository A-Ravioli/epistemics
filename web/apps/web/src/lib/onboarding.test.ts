import { describe, expect, it } from 'vitest';
import { tinyPack } from '../../test-fixtures/tiny-pack.js';
import { conceptsNamed, goalsFor, schedulingFor, shouldOfferPlacement, stepsFor, type OnboardingDraft } from './onboarding.js';

describe('stepsFor', () => {
  it('asks everything on a fresh device', () => {
    expect(stepsFor({ needsCourse: true, needsTutor: true })).toEqual(['subject', 'recall', 'tutor', 'commitment']);
  });

  it('skips the tutor when the device already has one', () => {
    expect(stepsFor({ needsCourse: true, needsTutor: false })).toEqual(['subject', 'recall', 'commitment']);
  });

  // A second device that pulled a synced course is asked only the question that really is device-local.
  it('asks only for a tutor when the course came over sync', () => {
    expect(stepsFor({ needsCourse: false, needsTutor: true })).toEqual(['tutor']);
  });

  it('asks nothing when there is nothing to ask', () => {
    expect(stepsFor({ needsCourse: false, needsTutor: false })).toEqual([]);
  });
});

describe('schedulingFor', () => {
  it('derives the week and the review cap from minutes a day', () => {
    expect(schedulingFor(20)).toEqual({ weeklyMinutes: 140, reviewsPerDay: 60, desiredRetention: 0.9 });
    expect(schedulingFor(40)).toEqual({ weeklyMinutes: 280, reviewsPerDay: 120, desiredRetention: 0.9 });
  });

  it('keeps the cap usable at the extremes', () => {
    expect(schedulingFor(1).reviewsPerDay).toBe(20);
    expect(schedulingFor(600).reviewsPerDay).toBe(400);
  });
});

describe('goalsFor', () => {
  it('turns the recall into the background and the minutes into a weekly budget', () => {
    const goals = goalsFor({ source: 'pack', minutesPerDay: 10, recall: '  I know Bayes  ' });
    expect(goals).toEqual({ purpose: 'understand', weeklyMinutes: 70, background: 'I know Bayes' });
  });

  it('omits an empty background rather than storing whitespace', () => {
    expect(goalsFor({ source: 'pack', recall: '   ' }).background).toBeUndefined();
  });

  it('carries an exam date only when the purpose is an exam', () => {
    const draft: OnboardingDraft = { source: 'pack', purpose: 'exam', examDate: '2026-12-01' };
    expect(goalsFor(draft).examDate).toBe(new Date('2026-12-01T12:00:00').getTime());
    expect(goalsFor({ ...draft, purpose: 'understand' }).examDate).toBeUndefined();
  });
});

describe('conceptsNamed', () => {
  const pack = tinyPack();

  it('finds a concept named outright', () => {
    expect(conceptsNamed(pack, 'I remember the complement rule from school.')).toEqual(['Complement rule']);
  });

  it('finds a concept whose distinctive words are all there', () => {
    expect(conceptsNamed(pack, 'you add probabilities of disjoint events; that addition thing')).toEqual(['Addition rule for disjoint events']);
  });

  // The reflection is only worth showing if it is true: one shared word is not knowing the concept.
  it('does not match on a single shared word', () => {
    expect(conceptsNamed(pack, 'probability is about events, I think')).toEqual([]);
  });

  it('says nothing about an empty recall', () => {
    expect(conceptsNamed(pack, '   ')).toEqual([]);
  });

  it('caps how much it claims to have found', () => {
    expect(conceptsNamed(pack, 'complement rule, addition rule for disjoint events', 1)).toHaveLength(1);
  });
});

describe('shouldOfferPlacement', () => {
  it('offers it when two concepts were named', () => {
    expect(shouldOfferPlacement('…', ['Complement rule', 'Addition rule for disjoint events'])).toBe(true);
  });

  it('offers it for a long recall with nothing to match against', () => {
    expect(shouldOfferPlacement('x'.repeat(120), [])).toBe(true);
  });

  it('does not offer it to someone who wrote nothing', () => {
    expect(shouldOfferPlacement('', [])).toBe(false);
    expect(shouldOfferPlacement(undefined, [])).toBe(false);
  });
});

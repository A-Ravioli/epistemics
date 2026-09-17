import { describe, expect, it } from 'vitest';
import type { ConceptState, Course } from '../../src/types.js';
import { renderLearnerModel, summarizeLearnerModel } from '../../src/session/learnerModel.js';

const course: Course = {
  id: 'course1',
  curriculumId: 'fixture',
  curriculumVersion: 1,
  title: 'Fixture course',
  goals: { purpose: 'understand', weeklyMinutes: 120, background: 'some stats' },
  settings: { desiredRetention: 0.9, reviewsPerDay: 120, maxNewItemsPerDay: 40, easyDays: [], dayStartHour: 4, timezone: 'UTC' },
  scaffolding: 'developing',
  createdAt: 1,
  updatedAt: 2,
};

function cs(conceptId: string, mastery: number, sessions: number, misconceptions: string[] = []): ConceptState {
  return { courseId: 'course1', conceptId, mastery, successfulSessions: sessions, misconceptions, assistedPass: 1, assistedN: 2, unassistedPass: 1, unassistedN: 2, updatedAt: Date.now() };
}

describe('learner model', () => {
  it('renders deterministically, without timestamps, under 4000 characters', () => {
    const states = Array.from({ length: 60 }, (_, i) => cs(`k${String(i).padStart(2, '0')}`, (i % 10) / 10, i % 4, i % 7 === 0 ? [`mc-${i}`, `mc-${i}b`, 'x', 'y'] : []));
    const names = new Map(states.map((s) => [s.conceptId, `Concept number ${s.conceptId} with a fairly long descriptive name`]));
    const input = {
      course,
      conceptStates: [...states].reverse(),
      conceptNames: names,
      calibration: { brier: 0.123456, overconfidenceBias: 0.04567, n: 150 },
      recent: { lastLessonSummary: 'I learned about things. '.repeat(40), openQuestions: ['why?', 'how?', 'when?', 'who?', 'where?'] },
    };
    const focus = states.slice(0, 30).map((s) => s.conceptId);
    const a = renderLearnerModel(summarizeLearnerModel(input), focus);
    const b = renderLearnerModel(summarizeLearnerModel({ ...input, conceptStates: states.map((s) => ({ ...s, updatedAt: 0 })) }), [...focus].reverse());
    expect(a).toBe(b);
    expect(a.length).toBeLessThan(4000);
    expect(a).not.toMatch(/\d{13}/); // no epoch timestamps
    expect(a).toContain('concepts: total=60');
    expect(a).toContain('related concepts (12):');
    expect(a).toContain('scaffolding: developing');
    expect(a).toContain('brier=0.12');
    expect(a.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(12 + 4);
    // only focus concepts are listed
    expect(a).not.toContain('k59');
    // misconceptions capped at 3 per concept
    expect(a).toContain('misconceptions=[mc-0,mc-0b,x]');
    expect(a).not.toContain(',y]');
  });

  it('summarises compactly and handles empty data', () => {
    const summary = summarizeLearnerModel({ course, conceptStates: [], conceptNames: new Map(), calibration: { brier: 0, overconfidenceBias: 0, n: 0 }, recent: { openQuestions: [] } });
    expect(summary.concepts).toEqual([]);
    expect(summary.preferences).toEqual({ verbosity: 'normal' });
    const text = renderLearnerModel(summary, ['c1']);
    expect(text).toContain('calibration: no data');
    expect(text).toContain('related concepts not yet started: 1');
  });
});

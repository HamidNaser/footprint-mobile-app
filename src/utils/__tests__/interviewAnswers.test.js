import { toAnswerDtos, AnswerType, InterviewStatus } from '../interviewAnswers';

/**
 * The screen keeps answers as a flat map of question id to value; the backend stores one
 * typed field per kind. These pin the translation.
 *
 * The failure worth guarding is quiet: putting a year in `text` stores "1975" as prose. It
 * displays perfectly and then cannot be sorted, filtered, or placed on a timeline — which
 * is most of why recording the interview is worth anything.
 */
describe('toAnswerDtos', () => {
  const questions = [
    { id: 'q1', text: 'What year did you visit?', type: 'year' },
    { id: 'q2', text: 'Who were you with?', type: 'people' },
    { id: 'q3', text: 'What was the occasion?', type: 'text' },
    { id: 'q4', text: 'What do you remember?', type: 'audio' },
    { id: 'q5', text: 'Any photos?', type: 'photo' },
    { id: 'q6', text: 'First time here?', type: 'boolean' },
  ];

  const byId = (dtos, id) => dtos.find((d) => d.questionId === id);

  it('puts a year in the year field, as a number', () => {
    const dtos = toAnswerDtos(questions, { q1: '1975' });

    expect(byId(dtos, 'q1').year).toBe(1975);
    expect(byId(dtos, 'q1').text).toBeNull();
  });

  it('drops a year that will not parse rather than storing zero', () => {
    // Zero would sort to the beginning of every timeline.
    expect(toAnswerDtos(questions, { q1: 'ages ago' })).toEqual([]);
  });

  it('keeps people as a list of ids', () => {
    expect(byId(toAnswerDtos(questions, { q2: ['sara', 'omar'] }), 'q2').peopleIds)
      .toEqual(['sara', 'omar']);
  });

  it('accepts a single person without a list', () => {
    expect(byId(toAnswerDtos(questions, { q2: 'sara' }), 'q2').peopleIds).toEqual(['sara']);
  });

  it('stores a boolean as a boolean', () => {
    expect(byId(toAnswerDtos(questions, { q6: true }), 'q6').boolValue).toBe(true);
    expect(byId(toAnswerDtos(questions, { q6: false }), 'q6').boolValue).toBe(false);
  });

  it('takes the recorder duration under either name', () => {
    // The mobile recorder reports `duration`; the web one reports `durationSeconds`.
    const a = toAnswerDtos(questions, { q4: { url: 'https://cdn/a.m4a', duration: 42 } });
    const b = toAnswerDtos(questions, { q4: { url: 'https://cdn/a.m4a', durationSeconds: 42 } });

    expect(byId(a, 'q4').durationSeconds).toBe(42);
    expect(byId(b, 'q4').durationSeconds).toBe(42);
  });

  it('rounds a fractional duration, because the backend stores whole seconds', () => {
    const dtos = toAnswerDtos(questions, { q4: { url: 'https://cdn/a.m4a', duration: 12.6 } });

    expect(byId(dtos, 'q4').durationSeconds).toBe(13);
  });

  it('drops an audio answer where nothing was recorded', () => {
    // The record button can be pressed and released without capturing. An audio answer
    // with no media renders as a player that plays nothing.
    expect(toAnswerDtos(questions, { q4: { duration: 0 } })).toEqual([]);
  });

  it('makes one answer per photo so each is addressable', () => {
    const dtos = toAnswerDtos(questions, {}, ['https://cdn/1.jpg', 'https://cdn/2.jpg']);

    expect(dtos).toHaveLength(2);
    expect(dtos.map((d) => d.questionId)).toEqual(['q5-1', 'q5-2']);
  });

  it('accepts photos as objects as well as urls', () => {
    // The picker hands back objects; an already-uploaded photo may be a bare url.
    const dtos = toAnswerDtos(questions, {}, [{ url: 'https://cdn/1.jpg' }]);

    expect(dtos[0].mediaUrl).toBe('https://cdn/1.jpg');
    expect(dtos[0].questionId).toBe('q5');
  });

  it('ignores a photo that never finished uploading', () => {
    const dtos = toAnswerDtos(questions, {}, [{ uri: 'file:///local.jpg' }, null]);

    expect(dtos).toHaveLength(1);
  });

  it('omits questions that were skipped', () => {
    // An unanswered question is absent, not blank. Storing empties would make an
    // abandoned interview look answered.
    expect(toAnswerDtos(questions, { q3: '   ', q2: [] })).toEqual([]);
  });

  it('carries the question text so an interview reads without the script', () => {
    expect(byId(toAnswerDtos(questions, { q3: 'A birthday' }), 'q3').questionText)
      .toBe('What was the occasion?');
  });

  it('survives being handed nothing', () => {
    expect(toAnswerDtos(null, {})).toEqual([]);
    expect(toAnswerDtos(questions, null)).toEqual([]);
  });
});

describe('constants', () => {
  it('mirror the backend exactly', () => {
    // Guessing these wrong stores a status or type the backend never reads. It was
    // 'in_progress'/'completed' and 'bool' on first attempt in the web app.
    expect(InterviewStatus.DRAFT).toBe('draft');
    expect(InterviewStatus.COMPLETE).toBe('complete');
    expect(AnswerType.BOOLEAN).toBe('boolean');
  });
});

import { createInterviewSession } from '../interviewSession';
import { startInterview, updateInterview, completeInterview } from '../../api/PlacesApi';

jest.mock('../../api/PlacesApi', () => ({
  startInterview: jest.fn(),
  updateInterview: jest.fn(),
  completeInterview: jest.fn(),
}));

/**
 * The interview screen recorded a grandparent's answers into component state and then
 * threw them away — it never called the API at all, despite the endpoints having been
 * written and sitting unused in PlacesApi.
 *
 * These cover what saving has to get right for that to stop being true.
 */
describe('createInterviewSession', () => {
  const subject = { id: 'grandpa', name: 'Grandpa Akram', avatar: 'a.jpg' };
  const place = { id: 'p1', name: 'Swansea' };
  const questions = [
    { id: 'q1', text: 'What year?', type: 'year' },
    { id: 'q2', text: 'What happened?', type: 'text' },
  ];

  beforeEach(() => {
    startInterview.mockResolvedValue({ id: 'i1' });
    updateInterview.mockResolvedValue({ id: 'i1' });
    completeInterview.mockResolvedValue({ journalEntryId: 'e1' });
  });

  afterEach(() => jest.clearAllMocks());

  const make = (over = {}) => createInterviewSession({ subject, place, ...over });

  it('does not create an interview until there is an answer to save', () => {
    // Opening the screen and changing your mind should leave no empty record behind.
    make();

    expect(startInterview).not.toHaveBeenCalled();
  });

  it('tells the server which memory the interview is about', async () => {
    const session = make({ targetEntryId: '68c000000000000000000009' });

    await session.persist(questions, { q2: 'The wedding' });

    expect(startInterview).toHaveBeenCalledWith(
      expect.objectContaining({ targetEntryId: '68c000000000000000000009' }),
    );
  });

  it('reuses one interview across every answer', async () => {
    // A new interview per question would scatter one conversation across several records.
    const session = make();

    await session.persist(questions, { q1: '1975' });
    await session.persist(questions, { q1: '1975', q2: 'A wedding' });

    expect(startInterview).toHaveBeenCalledTimes(1);
    expect(updateInterview).toHaveBeenCalledTimes(2);
  });

  it('saves answers in the shape the backend stores', async () => {
    const session = make();

    await session.persist(questions, { q1: '1975' });

    const [, payload] = updateInterview.mock.calls[0];
    expect(payload.answers[0]).toMatchObject({ questionId: 'q1', year: 1975, text: null });
    expect(payload.status).toBe('draft');
  });

  it('keeps going when one save fails', async () => {
    // The answers are still on screen and the next save carries everything again. Throwing
    // here would end the conversation over one bad request.
    updateInterview.mockRejectedValueOnce(new Error('Network down'));
    const errors = [];
    const session = make({ onError: (m) => errors.push(m) });

    await session.persist(questions, { q1: '1975' });
    expect(errors[0]).toMatch(/network down/i);

    await session.persist(questions, { q1: '1975', q2: 'A wedding' });
    expect(updateInterview).toHaveBeenCalledTimes(2);
  });

  it('sends everything once more before completing', async () => {
    // The last answer is set in the same tick as Finish and may not have been saved yet.
    const session = make();

    await session.complete(questions, { q1: '1975', q2: 'A wedding' });

    const [, payload] = updateInterview.mock.calls.at(-1);
    expect(payload.answers).toHaveLength(2);
    expect(completeInterview).toHaveBeenCalledWith('i1');
  });

  it('reports the journal entry the interview produced', async () => {
    const session = make();

    const outcome = await session.complete(questions, { q2: 'A wedding' });

    expect(outcome).toEqual({ journalEntryId: 'e1', interviewId: 'i1' });
  });

  it('returns null when completing fails, so the screen can stay open', async () => {
    // Closing over lost answers is the one outcome worth avoiding.
    completeInterview.mockRejectedValue(new Error('Server said no'));
    const errors = [];
    const session = make({ onError: (m) => errors.push(m) });

    const outcome = await session.complete(questions, { q2: 'A wedding' });

    expect(outcome).toBeNull();
    expect(errors.at(-1)).toMatch(/server said no/i);
  });

  it('completes without a target when the interview is about a place in general', async () => {
    // "Tell me about Swansea" is still worth recording, and should create its own entry.
    const session = make();

    await session.complete(questions, { q2: 'It rained' });

    expect(startInterview).toHaveBeenCalledWith(
      expect.objectContaining({ targetEntryId: undefined }),
    );
  });
});

import { startInterview, updateInterview, completeInterview } from '../api/PlacesApi';
import { toAnswerDtos, InterviewStatus } from './interviewAnswers';

/**
 * The server side of an interview.
 *
 * The interview screen recorded a grandparent's answers into component state and then
 * threw them away — it never called the API at all, despite the endpoints having been
 * written and sitting unused in `PlacesApi`. Closing the screen lost everything.
 *
 * Written as a plain factory rather than a hook so it can be tested the way the rest of
 * this codebase tests things: with `ApiClient` mocked and no renderer involved. The hook
 * in `hooks/useInterviewSession.js` is a thin wrapper that adds React state.
 *
 * @param {object} options
 * @param {object} options.subject - who is being interviewed: `{ id, name, avatar }`
 * @param {object} [options.place] - `{ id, name }`
 * @param {string} [options.targetEntryId] - the memory this interview is about. With it,
 *   completing appends the story to that entry rather than creating a second one beside
 *   it. `PlacesApi` drops ids that are not real entries, so a seeded memory still
 *   interviews fine and simply stands alone.
 * @param {(message: string) => void} [options.onError]
 */
export function createInterviewSession({ subject, place, targetEntryId, onError } = {}) {
  let interviewId = null;

  /**
   * Created lazily on the first answer rather than up front, so opening the interview and
   * changing your mind leaves no empty record behind.
   */
  const ensureInterview = async () => {
    if (interviewId) return interviewId;

    const started = await startInterview({
      intervieweeId: subject?.id,
      intervieweeName: subject?.name,
      intervieweeAvatar: subject?.avatar,
      placeId: place?.id,
      placeName: place?.name,
      targetEntryId,
    });

    interviewId = started?.id ?? null;
    return interviewId;
  };

  const saveDraft = async (id, questions, answers, photos) =>
    updateInterview(id, {
      answers: toAnswerDtos(questions, answers, photos),
      status: InterviewStatus.DRAFT,
    });

  return {
    /** The interview's server id, once one exists. */
    get id() {
      return interviewId;
    },

    /**
     * Save after each question rather than only at the end.
     *
     * An interview is a conversation, and conversations get interrupted — a phone call, a
     * tired eighty-year-old, an app backgrounded. Losing a grandparent's answers to that
     * is not a recoverable mistake: you cannot ask again next week and get the same words.
     */
    async persist(questions, answers, photos) {
      try {
        const id = await ensureInterview();
        if (!id) return;
        await saveDraft(id, questions, answers, photos);
      } catch (e) {
        // Keep the interview going. The answers are still in component state and the next
        // question's save carries everything again, so one failed request is survivable.
        onError?.(e?.message || 'Could not save that answer yet.');
      }
    },

    /**
     * Finish, and turn the answers into a journal entry.
     *
     * @returns {Promise<{journalEntryId: string|null, interviewId: string}|null>} null when
     *   it could not be saved, so the caller keeps the screen open rather than closing over
     *   lost answers.
     */
    async complete(questions, answers, photos) {
      try {
        const id = await ensureInterview();
        if (!id) throw new Error('The interview was never started.');

        // Send everything once more before completing: the last answer was set in the same
        // tick as this call and may not have been persisted yet.
        await saveDraft(id, questions, answers, photos);

        const result = await completeInterview(id);
        return { journalEntryId: result?.journalEntryId ?? null, interviewId: id };
      } catch (e) {
        onError?.(e?.message || 'Could not finish the interview. Your answers are still here.');
        return null;
      }
    },
  };
}

export default createInterviewSession;

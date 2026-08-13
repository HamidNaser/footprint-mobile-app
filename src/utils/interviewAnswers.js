/**
 * Turns the interview screen's answers into the shape the backend stores.
 *
 * The screen keeps answers as `{ [questionId]: value }`, where the value's meaning depends
 * on the question type — a number for a year, a list of ids for people, a string for text.
 * The backend stores one typed field per kind (`year`, `peopleIds`, `text`…) so it can
 * render an interview back without re-reading the question script.
 *
 * Putting a year in `text` would store "1975" as prose: it would display perfectly and
 * then fail to sort, filter, or land on a timeline — which is most of why recording the
 * interview is worth anything.
 *
 * This mirrors `src/utils/interviewAnswers.js` in the web app on purpose. Both clients
 * write to the same interview, and an answer given on a phone should read back identically
 * to one given in a browser.
 */

/** Mirrors InterviewAnswer.Type on the backend. Note 'boolean', not 'bool'. */
export const AnswerType = {
  TEXT: 'text',
  AUDIO: 'audio',
  PHOTO: 'photo',
  YEAR: 'year',
  BOOLEAN: 'boolean',
  PEOPLE: 'people',
};

/** Mirrors Footprint.Hub.Contracts InterviewStatus exactly. */
export const InterviewStatus = {
  DRAFT: 'draft',
  COMPLETE: 'complete',
};

/** An unanswered question is absent, not blank. */
function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * @param {Array<{id: string, text: string, type: string}>} questions - the script
 * @param {Record<string, any>} answers - keyed by question id
 * @param {Array<string|{url: string}>} [photos] - photos captured during the interview
 * @returns {Array<object>} InterviewAnswerDto-shaped objects
 */
export function toAnswerDtos(questions, answers, photos = []) {
  if (!Array.isArray(questions)) return [];

  const photoUrls = (photos || [])
    .map((p) => (typeof p === 'string' ? p : p?.url ?? p?.uri ?? null))
    .filter(Boolean);

  return questions.reduce((out, question) => {
    const value = answers?.[question.id];
    const isPhoto = question.type === AnswerType.PHOTO;

    // A photo question is answered by the captured photos, not by the answers map.
    if (isPhoto && photoUrls.length === 0) return out;
    if (!isPhoto && isEmpty(value)) return out;

    const dto = {
      questionId: question.id,
      questionText: question.text,
      type: question.type,
      text: null,
      mediaUrl: null,
      thumbnailUrl: null,
      durationSeconds: null,
      year: null,
      boolValue: null,
      peopleIds: null,
    };

    switch (question.type) {
      case AnswerType.YEAR: {
        const year = Number.parseInt(value, 10);
        // A year that will not parse is dropped rather than stored as 0, which would put
        // the memory at the start of every timeline.
        if (!Number.isFinite(year)) return out;
        dto.year = year;
        break;
      }

      case AnswerType.PEOPLE:
        dto.peopleIds = Array.isArray(value) ? value : [value];
        break;

      case AnswerType.BOOLEAN:
        dto.boolValue = Boolean(value);
        break;

      case AnswerType.AUDIO: {
        // The recorder hands back either a url or an object carrying duration.
        dto.mediaUrl = typeof value === 'string' ? value : value?.url ?? null;
        const seconds = typeof value === 'object' ? value?.durationSeconds ?? value?.duration : null;
        dto.durationSeconds = Number.isFinite(seconds) ? Math.round(seconds) : null;
        // The record button can be pressed and released without capturing anything. An
        // audio answer with no media renders as a player that plays nothing, which reads
        // as a lost recording rather than none.
        if (!dto.mediaUrl) return out;
        break;
      }

      case AnswerType.PHOTO:
        // One answer per photo so each is addressable, rather than a joined string.
        photoUrls.forEach((url, i) => out.push({
          ...dto,
          questionId: photoUrls.length > 1 ? `${question.id}-${i + 1}` : question.id,
          mediaUrl: url,
        }));
        return out;

      default:
        dto.text = String(value);
        break;
    }

    out.push(dto);
    return out;
  }, []);
}

export default toAnswerDtos;

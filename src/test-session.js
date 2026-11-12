import { getMaximumPoints, getQuestionPoints } from './quiz-engine.js';

export const TEST_DURATION_SECONDS = 60 * 60;
export const TEST_SESSION_STORAGE_KEY = 'smse-party-quiz-active-test';

export function createTestSession(questions, now = Date.now(), durationSeconds = TEST_DURATION_SECONDS) {
  return {
    questions,
    answers: Array(questions.length).fill(null),
    startedAt: now,
    expiresAt: now + durationSeconds * 1000,
    submittedAt: null,
  };
}

export function getRemainingSeconds(session, now = Date.now()) {
  return Math.max(0, Math.ceil((session.expiresAt - now) / 1000));
}

export function getAnsweredCount(session) {
  return session.answers.filter((answer) => answer !== null
    && answer !== undefined
    && (!Array.isArray(answer) || answer.length > 0)).length;
}

export function scoreTestSession(session) {
  const results = session.questions.map((question, index) => getQuestionPoints(question, session.answers[index]));
  return {
    results,
    score: results.reduce((sum, points) => sum + points, 0),
    correctCount: session.questions.filter((question, index) => results[index] === getMaximumPoints(question)).length,
    answeredCount: getAnsweredCount(session),
  };
}

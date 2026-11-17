import { getTopicQuestions, isCorrect, selectRandomQuestions } from './quiz-engine.js';

export function createPracticeSession(topic, questions, mode = 'practice') {
  return {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    topic,
    mode,
    questions: selectRandomQuestions(questions, questions.length),
    answers: Array(questions.length).fill(null),
    results: Array(questions.length).fill(null),
    currentIndex: 0,
    saved: false,
    view: 'question',
  };
}

function validAnswer(question, answer) {
  if (question.type === 'judge') return typeof answer === 'boolean';
  const ids = question.options.map((option) => option.id);
  if (question.type === 'single') return typeof answer === 'string' && ids.includes(answer);
  return Array.isArray(answer) && answer.length > 0
    && new Set(answer).size === answer.length && answer.every((id) => ids.includes(id));
}

export function answerPracticeQuestion(session, answer, submit = false) {
  const index = session.currentIndex;
  const question = session.questions[index];
  if (!question || typeof session.results[index] === 'boolean') return false;
  const empty = answer === undefined || answer === null || (Array.isArray(answer) && !answer.length);
  if (empty ? submit : !validAnswer(question, answer)) return false;
  session.answers[index] = empty ? null : Array.isArray(answer) ? [...answer] : answer;
  if (submit) session.results[index] = isCorrect(question, answer);
  return true;
}

export function movePracticeQuestion(session, direction) {
  session.currentIndex = Math.max(0, Math.min(session.questions.length - 1, session.currentIndex + direction));
  session.view = 'question';
}

export function getPracticeProgress(session) {
  const answeredCount = session.results.filter((result) => typeof result === 'boolean').length;
  return {
    answeredCount,
    correctCount: session.results.filter((result) => result === true).length,
    complete: session.questions.length > 0 && answeredCount === session.questions.length,
    firstUnanswered: session.results.findIndex((result) => typeof result !== 'boolean'),
  };
}

function questionSignature(question) {
  // Explanation-only updates can keep progress; changed prompts/options/answers cannot.
  return JSON.stringify([question.type, question.stem, question.options, question.answer]);
}

export function createPracticeStore(storage, userId = 'anonymous') {
  const prefix = `smse-party-quiz-practice:${encodeURIComponent(userId || 'anonymous')}`;
  const memory = new Map();
  const keyFor = (topic, mode) => `${prefix}:${mode}:${encodeURIComponent(topic)}`;

  function read(key) {
    try {
      return JSON.parse(memory.get(key) ?? storage?.getItem(key) ?? 'null');
    } catch {
      return null;
    }
  }

  function write(key, value) {
    const serialized = JSON.stringify(value);
    memory.set(key, serialized);
    try {
      if (!storage) return false;
      storage.setItem(key, serialized);
      return true;
    } catch {
      return false;
    }
  }

  function save(session) {
    const saved = write(keyFor(session.topic, session.mode), {
      version: 1,
      id: session.id,
      topic: session.topic,
      mode: session.mode,
      currentIndex: session.currentIndex,
      saved: session.saved,
      view: session.view,
      items: session.questions.map((question, index) => ({
        id: question.id,
        signature: questionSignature(question),
        answer: session.answers[index],
        submitted: typeof session.results[index] === 'boolean',
      })),
    });
    const lastSaved = write(`${prefix}:last`, { topic: session.topic, mode: session.mode });
    return saved && lastSaved;
  }

  function last() {
    const value = read(`${prefix}:last`);
    return typeof value?.topic === 'string' && ['practice', 'mistakes'].includes(value.mode)
      ? { topic: value.topic, mode: value.mode } : null;
  }

  function load(topic, bank, mode = 'practice') {
    const value = read(keyFor(topic, mode));
    if (value?.version !== 1 || value.topic !== topic || value.mode !== mode
      || !['practice', 'mistakes'].includes(mode) || typeof value.id !== 'string' || !value.id
      || !Number.isInteger(value.currentIndex) || value.currentIndex < 0
      || !Array.isArray(value.items) || !value.items.length || value.currentIndex >= value.items.length
      || value.items.some((item) => typeof item?.id !== 'string')
      || new Set(value.items.map((item) => item.id)).size !== value.items.length) return null;

    const available = getTopicQuestions(bank, topic);
    const byId = new Map(available.map((question) => [question.id, question]));
    const retained = value.items.filter((item) => byId.has(item.id));
    const oldIds = new Set(value.items.map((item) => item.id));
    const added = mode === 'practice' ? selectRandomQuestions(available.filter((question) => !oldIds.has(question.id)), available.length) : [];
    const questions = [...retained.map((item) => byId.get(item.id)), ...added];
    if (!questions.length) return null;

    const restored = createPracticeSession(topic, [], mode);
    restored.questions = questions;
    restored.answers = questions.map(() => null);
    restored.results = questions.map(() => null);
    let changed = retained.length !== value.items.length || added.length > 0;
    retained.forEach((item, index) => {
      const question = questions[index];
      if (item.signature !== questionSignature(question)) {
        changed = true;
        return;
      }
      if (validAnswer(question, item.answer)) {
        restored.answers[index] = Array.isArray(item.answer) ? [...item.answer] : item.answer;
        if (item.submitted === true) restored.results[index] = isCorrect(question, item.answer);
      } else if (item.submitted === true || (item.answer !== null && item.answer !== undefined)) {
        changed = true;
      }
    });
    const currentId = value.items[value.currentIndex].id;
    const currentIndex = questions.findIndex((question) => question.id === currentId);
    restored.currentIndex = currentIndex < 0 ? Math.min(value.currentIndex, questions.length - 1) : currentIndex;
    if (!changed) restored.id = value.id;
    restored.saved = !changed && value.saved === true && getPracticeProgress(restored).complete;
    restored.view = !changed && value.view === 'summary' && getPracticeProgress(restored).complete ? 'summary' : 'question';
    return restored;
  }

  return { save, load, last };
}

export function normalizeAnswer(question, answer) {
  if (question.type === 'multiple') {
    return [...new Set(Array.isArray(answer) ? answer : [])].sort();
  }

  return answer;
}

function isUsableQuestion(question) {
    if (!question || typeof question !== 'object') return false;
    if ([question.id, question.topic, question.stem, question.explanation].some((value) => typeof value !== 'string' || !value.trim())) return false;
    if (typeof question.source?.title !== 'string' || !question.source.title.trim()) return false;
    if (typeof question.source.url !== 'string' || !question.source.url.startsWith('https://')) return false;

    const options = Array.isArray(question.options) ? question.options : [];
    const optionIds = options.map((option) => option?.id);
    if (optionIds.some((id) => typeof id !== 'string') || new Set(optionIds).size !== optionIds.length) return false;
    if (question.type === 'judge') return typeof question.answer === 'boolean' && options.length === 0;
    if (!options.length || options.some((option) => typeof option?.text !== 'string' || !option.text.trim())) return false;
    if (question.type === 'single') return typeof question.answer === 'string' && optionIds.includes(question.answer);
    if (question.type === 'multiple') {
      return Array.isArray(question.answer)
        && question.answer.length > 0
        && new Set(question.answer).size === question.answer.length
        && question.answer.every((id) => optionIds.includes(id));
    }
    return false;
}

export function getUsableQuestions(questions) {
  return Array.isArray(questions) ? questions.filter(isUsableQuestion) : [];
}

export function getTopicNames(questions) {
  return [...new Set(getUsableQuestions(questions).map((question) => question.topic))];
}

export function getTopicQuestions(questions, topic) {
  if (typeof topic !== 'string') return [];
  return getUsableQuestions(questions).filter((question) => question.topic === topic);
}

export function isCorrect(question, answer) {
  const normalized = normalizeAnswer(question, answer);

  if (question.type === 'multiple') {
    const expected = normalizeAnswer(question, question.answer);
    return normalized.length === expected.length && normalized.every((value, index) => value === expected[index]);
  }

  if (question.type === 'judge') {
    return typeof answer === 'boolean' && answer === question.answer;
  }

  return question.type === 'single' && typeof answer === 'string' && answer === question.answer;
}

export function getQuestionPoints(question, answer) {
  if (question.type === 'single') return answer === question.answer ? 2 : 0;
  if (question.type === 'judge') return answer === question.answer ? 1 : 0;

  const selected = normalizeAnswer(question, Array.isArray(answer) ? answer : []);
  const expected = normalizeAnswer(question, question.answer);
  if (selected.some((id) => !expected.includes(id))) return 0;
  if (selected.length === expected.length) return 3;
  return selected.length > 0 ? 1 : 0;
}

export const TEST_BLUEPRINT = Object.freeze({ single: 25, multiple: 10, judge: 20 });
export const CURRENT_AFFAIRS_BLUEPRINT = Object.freeze({ single: 5, multiple: 2, judge: 4 });
export const MAX_CURRENT_AFFAIRS_POINTS = 20;

export function isCurrentAffairsQuestion(question) {
  return question?.isCurrentAffairs === true
    || question?.topic === '时事政治与高质量发展';
}

export function createMockTestQuestions(questions, random = Math.random) {
  const usable = getUsableQuestions(questions);
  const groups = Object.fromEntries(Object.keys(TEST_BLUEPRINT).map((type) => [
    type,
    usable.filter((question) => question.type === type),
  ]));

  if (Object.entries(TEST_BLUEPRINT).some(([type, count]) => groups[type].length < count)) return [];

  const paper = [];
  const usedConcepts = new Set();
  for (const [type, count] of Object.entries(TEST_BLUEPRINT)) {
    const pool = selectRandomQuestions(groups[type], groups[type].length, random);
    const currentAffairs = pool.filter(isCurrentAffairsQuestion);
    const regular = pool.filter((question) => !isCurrentAffairsQuestion(question));
    const currentAffairsLimit = Math.min(CURRENT_AFFAIRS_BLUEPRINT[type], count);
    let selected = 0;
    let currentAffairsSelected = 0;
    for (const question of [...currentAffairs, ...regular]) {
      const conceptId = question.conceptId || question.id;
      if (usedConcepts.has(conceptId)) continue;
      if (isCurrentAffairsQuestion(question) && currentAffairsSelected >= currentAffairsLimit) continue;
      usedConcepts.add(conceptId);
      paper.push(question);
      selected += 1;
      if (isCurrentAffairsQuestion(question)) currentAffairsSelected += 1;
      if (selected === count) break;
    }
    if (selected < count) return [];
  }
  return selectRandomQuestions(paper, paper.length, random);
}

export function getMaximumPoints(question) {
  return question.type === 'single' ? 2 : question.type === 'multiple' ? 3 : question.type === 'judge' ? 1 : 0;
}

export function selectRandomQuestions(questions, count, random = Math.random) {
  const pool = [...questions];
  const limit = Math.min(pool.length, Math.max(0, Math.floor(count)));

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, limit);
}

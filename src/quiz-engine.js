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

export function selectRandomQuestions(questions, count, random = Math.random) {
  const pool = [...questions];
  const limit = Math.min(pool.length, Math.max(0, Math.floor(count)));

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  return pool.slice(0, limit);
}

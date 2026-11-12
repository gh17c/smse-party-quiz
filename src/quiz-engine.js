export function normalizeAnswer(question, answer) {
  if (question.type === 'multiple') {
    return [...new Set(Array.isArray(answer) ? answer : [])].sort();
  }

  return answer;
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

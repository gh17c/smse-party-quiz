const HISTORY_LIMIT = 20;
const HISTORY_MODES = new Set(['practice', 'mistakes', 'test']);

function isValidRecord(record) {
  const questionCount = record?.questionCount ?? record?.total;
  return record !== null
    && typeof record === 'object'
    && typeof record.id === 'string'
    && HISTORY_MODES.has(record.mode)
    && typeof record.topic === 'string'
    && Number.isFinite(record.score)
    && Number.isFinite(record.total)
    && record.total > 0
    && record.score >= 0
    && record.score <= record.total
    && Number.isFinite(record.correctCount)
    && record.correctCount >= 0
    && Number.isFinite(questionCount)
    && questionCount > 0
    && record.correctCount <= questionCount
    && (!('questionCount' in record) || Number.isInteger(record.questionCount))
    && typeof record.completedAt === 'string'
    && Number.isFinite(Date.parse(record.completedAt));
}

export function createProgressStore(storage, key = 'smse-party-quiz-history') {
  function list() {
    try {
      const parsed = JSON.parse(storage?.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed.filter(isValidRecord) : [];
    } catch {
      return [];
    }
  }

  function add(record) {
    const records = [record, ...list()].slice(0, HISTORY_LIMIT);
    try {
      storage?.setItem(key, JSON.stringify(records));
    } catch {
      return records;
    }
    return records;
  }

  function clear() {
    try {
      storage?.removeItem(key);
    } catch {
      // Keep the page usable when browser storage is blocked.
    }
  }

  function replace(records) {
    const validRecords = Array.isArray(records) ? records.filter(isValidRecord).slice(0, HISTORY_LIMIT) : [];
    try {
      storage?.setItem(key, JSON.stringify(validRecords));
    } catch {
      return validRecords;
    }
    return validRecords;
  }

  return { list, add, clear, replace };
}

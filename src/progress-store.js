const HISTORY_LIMIT = 20;

export function createProgressStore(storage, key = 'smse-party-quiz-history') {
  function list() {
    try {
      const parsed = JSON.parse(storage?.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
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

  return { list, add, clear };
}

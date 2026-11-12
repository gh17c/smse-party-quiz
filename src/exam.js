import { createProgressStore } from './progress-store.js';
import { getUsableQuestions } from './quiz-engine.js';
import { getAnsweredCount, getRemainingSeconds, scoreTestSession, TEST_SESSION_STORAGE_KEY } from './test-session.js';

const content = document.querySelector('#exam-content');
const examStatus = document.querySelector('#exam-status');
const questionList = document.querySelector('#exam-questions');
const answerGrid = document.querySelector('#answer-grid');
const form = document.querySelector('#exam-form');
const dialog = document.querySelector('#submit-dialog');
const dialogCopy = document.querySelector('#submit-dialog-copy');
let session;
let timerId;

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function saveSession() {
  try {
    window.sessionStorage.setItem(TEST_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // The in-memory answer state remains usable if storage becomes unavailable.
  }
}

function readSession() {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(TEST_SESSION_STORAGE_KEY) || 'null');
    if (!stored || !Array.isArray(stored.questions) || stored.questions.length !== 55) return null;
    if (stored.answers?.length !== stored.questions.length || getUsableQuestions(stored.questions).length !== stored.questions.length) return null;
    if (!Number.isFinite(stored.startedAt) || !Number.isFinite(stored.expiresAt) || stored.expiresAt <= stored.startedAt) return null;
    return stored;
  } catch {
    return null;
  }
}

function answerLabel(question, answer) {
  if (question.type === 'judge') return answer ? '正确' : '错误';
  const answerIds = Array.isArray(answer) ? answer : [answer];
  return answerIds.map((id) => question.options.find((option) => option.id === id)?.text).filter(Boolean).join('、');
}

function typeLabel(type) {
  return { single: '单选题', multiple: '多选题', judge: '判断题' }[type] || '题目';
}

function answerChoices(question) {
  return question.type === 'judge'
    ? [{ id: 'true', text: '正确' }, { id: 'false', text: '错误' }]
    : question.options;
}

function buildAnswerSheet() {
  answerGrid.replaceChildren();
  session.questions.forEach((_question, index) => {
    const button = makeElement('button', 'answer-nav-item', String(index + 1).padStart(2, '0'));
    button.type = 'button';
    button.setAttribute('aria-label', `第 ${index + 1} 题，未作答`);
    button.dataset.answerNav = String(index);
    button.addEventListener('click', () => {
      document.querySelector(`[data-exam-question="${index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    answerGrid.append(button);
  });
}

function updateProgress() {
  const answered = getAnsweredCount(session);
  const total = session.questions.length;
  document.querySelector('#answered-count').textContent = String(answered);
  document.querySelector('#total-count').textContent = String(total);
  document.querySelector('#progress-label').textContent = `${Math.round(answered / total * 100)}%`;
  const track = document.querySelector('#progress-track');
  track.setAttribute('aria-valuemax', String(total));
  track.setAttribute('aria-valuenow', String(answered));
  document.querySelector('#progress-fill').style.width = `${answered / total * 100}%`;

  answerGrid.querySelectorAll('[data-answer-nav]').forEach((button) => {
    const index = Number(button.dataset.answerNav);
    const answer = session.answers[index];
    const answeredQuestion = answer !== null && answer !== undefined && (!Array.isArray(answer) || answer.length > 0);
    button.classList.toggle('is-answered', answeredQuestion);
    button.setAttribute('aria-label', `第 ${index + 1} 题，${answeredQuestion ? '已作答' : '未作答'}`);
  });
}

function readAnswer(index, question) {
  const values = new FormData(form).getAll(`answer-${index}`);
  if (question.type === 'judge') return values.length ? values[0] === 'true' : null;
  if (question.type === 'multiple') return values;
  return values[0] ?? null;
}

function renderQuestions() {
  questionList.replaceChildren();
  session.questions.forEach((question, index) => {
    const article = makeElement('article', 'exam-question');
    article.dataset.examQuestion = String(index);
    const meta = makeElement('div', 'exam-question-meta');
    meta.append(
      makeElement('span', 'exam-question-number', `第 ${String(index + 1).padStart(2, '0')} 题`),
      makeElement('span', 'question-type', typeLabel(question.type)),
    );
    const fieldset = makeElement('fieldset', 'answer-fieldset exam-answer-fieldset');
    fieldset.append(makeElement('legend', 'question-stem', question.stem));
    const selected = session.answers[index];
    for (const option of answerChoices(question)) {
      const label = makeElement('label', 'answer-option');
      const input = makeElement('input');
      input.id = `exam-${index}-${option.id}`;
      input.type = question.type === 'multiple' ? 'checkbox' : 'radio';
      input.name = `answer-${index}`;
      input.value = option.id;
      input.checked = Array.isArray(selected)
        ? selected.includes(option.id)
        : selected !== null && selected !== undefined && String(selected) === option.id;
      label.append(input, makeElement('span', '', option.text));
      fieldset.append(label);
    }
    article.append(meta, fieldset);
    questionList.append(article);
  });

  form.addEventListener('change', (event) => {
    const input = event.target.closest('input[name^="answer-"]');
    if (!input) return;
    const index = Number(input.name.slice('answer-'.length));
    session.answers[index] = readAnswer(index, session.questions[index]);
    saveSession();
    updateProgress();
  });
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function updateClock() {
  const remaining = getRemainingSeconds(session);
  const clock = document.querySelector('#exam-clock');
  clock.textContent = formatTime(remaining);
  clock.classList.toggle('is-low-time', remaining <= 5 * 60);
  if (remaining === 0) finishTest(true);
}

function appendSource(target, question) {
  const source = makeElement('a', 'source-link', `资料来源：${question.source.title}`);
  source.href = question.source.url;
  source.target = '_blank';
  source.rel = 'noreferrer';
  target.append(source);
}

function appendReviewNotes(target, question) {
  const notes = makeElement('div', 'learning-notes');
  notes.append(
    makeElement('strong', 'learning-notes-title', '知识解读'),
    makeElement('p', 'feedback-explanation', question.explanation),
    makeElement('strong', 'learning-notes-title', '条文依据'),
    makeElement('p', 'feedback-explanation', question.annotation?.basis || question.source.title),
    makeElement('strong', 'learning-notes-title', '易错提醒'),
    makeElement('p', 'feedback-explanation', question.annotation?.pitfall || '核对题目中的主体、条件和程序要求。'),
  );
  target.append(notes);
}

function saveRecord() {
  if (session.recordSaved) return;
  const score = scoreTestSession(session);
  const record = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    mode: 'test',
    topic: '全部专题',
    score: score.score,
    total: 100,
    questionCount: session.questions.length,
    correctCount: score.correctCount,
    completedAt: new Date(session.submittedAt).toISOString(),
  };
  try {
    createProgressStore(window.localStorage).add(record);
    session.recordSaved = true;
    saveSession();
  } catch {
    // Exam results remain visible when persistent history is blocked.
  }
}

function renderResults() {
  clearInterval(timerId);
  saveRecord();
  document.title = '测试结果 · 综合测试';
  document.querySelector('.exam-monitor').hidden = true;
  const result = scoreTestSession(session);
  const elapsedSeconds = Math.min(60 * 60, Math.max(0, Math.floor((session.submittedAt - session.startedAt) / 1000)));
  const summary = makeElement('section', 'exam-result-summary');
  summary.dataset.examResults = '';
  const scoreValue = makeElement('p', 'exam-result-score', String(result.score));
  scoreValue.append(makeElement('span', '', '/ 100 分'));
  summary.append(
    makeElement('h2', '', '测试完成'),
    scoreValue,
    makeElement('p', 'exam-result-detail', `答对 ${result.correctCount} / ${session.questions.length} 题 · 已答 ${result.answeredCount} 题 · 用时 ${formatTime(elapsedSeconds)}`),
    makeElement('p', 'exam-result-detail', '多选题少选得 1 分，错选不得分。'),
  );
  if (session.timeExpired) summary.append(makeElement('p', 'exam-result-detail exam-expired-note', '考试时间结束，系统已自动交卷。'));
  const links = makeElement('div', 'exam-result-links');
  const home = makeElement('a', 'button button-red', '返回首页');
  home.href = 'index.html';
  const again = makeElement('a', 'button button-quiet', '再测一次');
  again.href = 'test.html';
  links.append(home, again);
  summary.append(links);

  const reviewHeading = makeElement('h2', 'review-heading', '逐题解析');
  const reviewList = makeElement('div', 'test-result-list');
  session.questions.forEach((question, index) => {
    const points = result.results[index];
    const maximum = question.type === 'single' ? 2 : question.type === 'multiple' ? 3 : 1;
    const correct = points === maximum;
    const item = makeElement('article', `test-result ${correct ? 'is-correct' : 'is-wrong'}`);
    item.dataset.examReviewItem = '';
    item.append(
      makeElement('p', 'question-count', `${String(index + 1).padStart(2, '0')} · ${correct ? '回答正确' : points > 0 ? '部分得分' : '未得分'} · ${points} / ${maximum} 分`),
      makeElement('h3', 'result-stem', question.stem),
    );
    const answer = session.answers[index];
    item.append(makeElement('p', 'feedback-answer', `你的答案：${answer === null || answer === undefined || (Array.isArray(answer) && !answer.length) ? '未作答' : answerLabel(question, answer)}`));
    if (!correct) item.append(makeElement('p', 'feedback-answer', `正确答案：${answerLabel(question, question.answer)}`));
    appendReviewNotes(item, question);
    appendSource(item, question);
    reviewList.append(item);
  });
  content.replaceChildren(summary, reviewHeading, reviewList);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function finishTest(timeExpired = false) {
  if (!session || session.submittedAt) return;
  session.submittedAt = Date.now();
  session.timeExpired = timeExpired;
  session.results = scoreTestSession(session).results;
  saveSession();
  renderResults();
}

function openSubmitDialog() {
  const unanswered = session.questions.length - getAnsweredCount(session);
  dialogCopy.textContent = unanswered
    ? `还有 ${unanswered} 道题未作答。确认交卷后将结束本次测试。`
    : '所有题目均已作答。确认交卷并查看成绩与逐题解析？';
  dialog.showModal();
}

session = readSession();
if (!session) {
  document.querySelector('.exam-monitor').hidden = true;
  examStatus.hidden = false;
} else if (session.submittedAt) {
  content.hidden = false;
  renderResults();
} else {
  content.hidden = false;
  buildAnswerSheet();
  renderQuestions();
  updateProgress();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    openSubmitDialog();
  });
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'confirm') finishTest(false);
  });
  document.querySelector('#exit-exam').addEventListener('click', (event) => {
    event.preventDefault();
    if (!window.confirm('退出将结束当前答卷并清除作答进度。确定退出吗？')) return;
    window.sessionStorage.removeItem(TEST_SESSION_STORAGE_KEY);
    window.location.assign('test.html');
  });
  updateClock();
  timerId = window.setInterval(updateClock, 1000);
  document.addEventListener('visibilitychange', updateClock);
  document.querySelector('#confirm-submit').addEventListener('click', () => {
    if (dialog.open) dialog.close('confirm');
  });
}

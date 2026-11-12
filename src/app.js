import { questionBank } from './questions.js';
import { getTopicQuestions, getUsableQuestions, isCorrect, selectRandomQuestions } from './quiz-engine.js';
import { createProgressStore } from './progress-store.js';

const practiceContent = document.querySelector('#practice-content');
const historyList = document.querySelector('#history-list');
let progressStore;
try {
  progressStore = createProgressStore(window.localStorage);
} catch {
  progressStore = createProgressStore(null);
}

let historyRecords = progressStore.list();
let session = null;

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function questionTypeLabel(type) {
  return { single: '单选题', multiple: '多选题', judge: '判断题' }[type] || '练习题';
}

function answerLabel(question, answer) {
  if (question.type === 'judge') return answer ? '正确' : '错误';
  const answerIds = Array.isArray(answer) ? answer : [answer];
  return answerIds.map((id) => question.options.find((option) => option.id === id)?.text).filter(Boolean).join('、');
}

function appendSource(target, question) {
  const source = makeElement('a', 'source-link', `资料来源：${question.source.title}`);
  source.href = question.source.url;
  source.target = '_blank';
  source.rel = 'noreferrer';
  source.dataset.source = '';
  target.append(source);
}

function getSelectedAnswer(form, question) {
  const values = new FormData(form).getAll('answer');
  if (question.type === 'judge') return values.length ? values[0] === 'true' : undefined;
  if (question.type === 'multiple') return values;
  return values[0];
}

function getTestPool() {
  const selectedTopic = document.querySelector('#test-topic').value;
  if (selectedTopic !== 'all') return getTopicQuestions(questionBank, selectedTopic);
  return getUsableQuestions(questionBank);
}

function updateTestAvailability() {
  const available = getTestPool().length;
  const startButton = document.querySelector('#start-test');
  const message = document.querySelector('#test-availability');
  startButton.disabled = available < 10;
  message.hidden = available >= 10;
  message.textContent = `当前专题有 ${available} 道可用题，至少需要 10 道才能开始测试。`;
}

function saveSession() {
  if (!session || session.saved) return;
  const correctCount = session.results.filter(Boolean).length;
  const record = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    mode: session.mode,
    topic: session.topic,
    score: correctCount,
    total: session.questions.length,
    correctCount,
    completedAt: new Date().toISOString(),
  };
  historyRecords = progressStore.add(record);
  session.saved = true;
  renderHistory();
}

function renderHistory() {
  historyList.replaceChildren();
  if (!historyRecords.length) {
    historyList.append(makeElement('p', 'empty-state', '完成答题后，这里会显示本机最近 20 次学习记录。'));
    return;
  }

  const list = makeElement('ol', 'history-list');
  for (const record of historyRecords) {
    const item = makeElement('li', 'history-row');
    const details = makeElement('div', 'history-details');
    details.append(makeElement('strong', '', record.topic));
    const mode = record.mode === 'test' ? '模拟测试' : record.mode === 'mistakes' ? '错题重做' : '专题练习';
    details.append(makeElement('span', '', `${mode} · ${new Date(record.completedAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}`));
    item.append(details, makeElement('strong', 'history-score', `${record.score} / ${record.total} 分`));
    list.append(item);
  }
  historyList.append(list);
}

function startPractice(topic, questions = getTopicQuestions(questionBank, topic), mode = 'practice') {
  session = {
    mode,
    topic,
    questions: [...questions],
    answers: Array(questions.length),
    results: Array(questions.length),
    currentIndex: 0,
    answered: false,
    saved: false,
  };

  if (!session.questions.length) {
    practiceContent.replaceChildren(makeElement('p', 'empty-state', '这个专题暂时没有题目。'));
  } else {
    renderQuestion();
  }
  document.querySelector('#practice').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderQuestion() {
  const question = session.questions[session.currentIndex];
  practiceContent.replaceChildren();

  const panel = makeElement('article', 'question-panel');
  panel.dataset.practiceQuestion = '';
  const meta = makeElement('div', 'question-meta');
  meta.append(
    makeElement('span', 'question-count', `${String(session.currentIndex + 1).padStart(2, '0')} / ${String(session.questions.length).padStart(2, '0')}`),
    makeElement('span', 'question-type', questionTypeLabel(question.type)),
  );
  panel.append(meta);

  const form = makeElement('form', 'answer-form');
  const fieldset = makeElement('fieldset', 'answer-fieldset');
  const inputs = [];
  fieldset.append(makeElement('legend', 'question-stem', question.stem));
  const answerChoices = question.type === 'judge'
    ? [{ id: 'true', text: '正确' }, { id: 'false', text: '错误' }]
    : question.options;
  for (const option of answerChoices) {
    const row = makeElement('label', 'answer-option');
    const input = makeElement('input');
    input.type = question.type === 'multiple' ? 'checkbox' : 'radio';
    input.name = 'answer';
    input.value = option.id;
    input.disabled = session.answered;
    const selected = session.answers[session.currentIndex];
    input.checked = Array.isArray(selected) ? selected.includes(option.id) : selected !== undefined && String(selected) === option.id;
    row.append(input, makeElement('span', '', option.text));
    fieldset.append(row);
    inputs.push(input);
  }
  form.append(fieldset);

  if (!session.answered) {
    const error = makeElement('p', 'answer-error', '请先选择答案。');
    error.hidden = true;
    error.setAttribute('role', 'alert');
    error.id = `answer-error-${question.id}`;
    fieldset.setAttribute('aria-describedby', error.id);
    inputs.forEach((input) => input.addEventListener('change', () => {
      error.hidden = true;
      inputs.forEach((option) => option.removeAttribute('aria-invalid'));
    }));
    form.append(error);
    const submit = makeElement('button', 'button button-red answer-submit', '提交答案');
    submit.type = 'submit';
    submit.dataset.action = 'submit-answer';
    form.append(submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const answer = getSelectedAnswer(form, question);
      if (answer === undefined || (Array.isArray(answer) && !answer.length)) {
        error.hidden = false;
        inputs.forEach((input) => input.setAttribute('aria-invalid', 'true'));
        inputs[0]?.focus();
        return;
      }
      session.answers[session.currentIndex] = answer;
      session.results[session.currentIndex] = isCorrect(question, answer);
      session.answered = true;
      renderQuestion();
    });
  }
  panel.append(form);

  if (session.answered) {
    const correct = session.results[session.currentIndex];
    const feedback = makeElement('section', `answer-feedback ${correct ? 'is-correct' : 'is-wrong'}`);
    feedback.dataset.feedback = '';
    feedback.setAttribute('aria-live', 'polite');
    feedback.append(makeElement('strong', 'feedback-status', correct ? '回答正确' : '回答错误'));
    if (!correct) feedback.append(makeElement('p', 'feedback-answer', `正确答案：${answerLabel(question, question.answer)}`));
    feedback.append(makeElement('p', 'feedback-explanation', question.explanation));
    appendSource(feedback, question);
    panel.append(feedback);

    const next = makeElement('button', 'button button-red next-question', session.currentIndex === session.questions.length - 1 ? '查看本轮结果' : '下一题');
    next.type = 'button';
    next.dataset.action = 'next-question';
    next.addEventListener('click', () => {
      if (session.currentIndex < session.questions.length - 1) {
        session.currentIndex += 1;
        session.answered = false;
        renderQuestion();
      } else {
        renderPracticeSummary();
      }
    });
    panel.append(next);
  }

  practiceContent.append(panel);
}

function renderPracticeSummary() {
  saveSession();
  const correctCount = session.results.filter(Boolean).length;
  const wrongQuestions = session.questions.filter((_question, index) => session.results[index] === false);
  const summary = makeElement('section', 'practice-summary');
  summary.dataset.practiceSummary = '';
  summary.append(
    makeElement('p', 'section-kicker', session.mode === 'mistakes' ? 'MISTAKE REVIEW' : 'TOPIC PRACTICE'),
    makeElement('h3', '', '本轮完成'),
    makeElement('p', 'summary-score', `答对 ${correctCount} / ${session.questions.length} 题`),
    makeElement('p', 'summary-topic', `${session.topic} · ${session.mode === 'mistakes' ? '错题重做' : '专题练习'}`),
  );

  if (wrongQuestions.length) {
    const retry = makeElement('button', 'button button-red', '重做错题');
    retry.type = 'button';
    retry.dataset.action = 'retry-wrong';
    retry.addEventListener('click', () => startPractice(session.topic, wrongQuestions, 'mistakes'));
    summary.append(retry);
  } else {
    summary.append(makeElement('p', 'all-correct-note', '本轮全部答对。'));
  }

  const back = makeElement('button', 'text-button summary-back', '返回首页');
  back.type = 'button';
  back.addEventListener('click', returnHome);
  summary.append(back);
  practiceContent.replaceChildren(summary);
}

function startTest() {
  const select = document.querySelector('#test-topic');
  const topic = select.value === 'all' ? '全部专题' : select.value;
  const pool = getTestPool();
  if (pool.length < 10) return;

  session = {
    mode: 'test',
    topic,
    questions: selectRandomQuestions(pool, 10),
    answers: Array(10),
    results: Array(10),
    saved: false,
  };
  document.querySelector('#practice-title').textContent = '模拟测试';
  renderTest();
  document.querySelector('#practice').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderTest() {
  const form = makeElement('form', 'mock-test-form');
  form.dataset.testForm = '';
  form.append(makeElement('p', 'test-session-note', '模拟测试 · 共 10 题 · 提交前不显示答案与解析'));

  session.questions.forEach((question, index) => {
    const panel = makeElement('article', 'mock-question');
    panel.dataset.testQuestion = String(index);
    const meta = makeElement('div', 'question-meta');
    meta.append(
      makeElement('span', 'question-count', `${String(index + 1).padStart(2, '0')} / 10`),
      makeElement('span', 'question-type', questionTypeLabel(question.type)),
    );
    const fieldset = makeElement('fieldset', 'answer-fieldset');
    fieldset.append(makeElement('legend', 'question-stem', question.stem));
    const answerChoices = question.type === 'judge'
      ? [{ id: 'true', text: '正确' }, { id: 'false', text: '错误' }]
      : question.options;
    for (const option of answerChoices) {
      const label = makeElement('label', 'answer-option');
      const input = makeElement('input');
      input.id = `mock-${index}-${option.id}`;
      input.type = question.type === 'multiple' ? 'checkbox' : 'radio';
      input.name = `answer-${index}`;
      input.value = option.id;
      label.append(input, makeElement('span', '', option.text));
      fieldset.append(label);
    }
    panel.append(meta, fieldset);
    form.append(panel);
  });

  const submit = makeElement('button', 'button button-red test-submit', '提交测试');
  submit.type = 'submit';
  submit.dataset.action = 'submit-test';
  form.append(submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    session.results = session.questions.map((question, index) => {
      const values = formData.getAll(`answer-${index}`);
      const answer = question.type === 'judge'
        ? (values.length ? values[0] === 'true' : undefined)
        : question.type === 'multiple' ? values : values[0];
      session.answers[index] = answer;
      return isCorrect(question, answer);
    });
    renderTestResults();
  });

  practiceContent.replaceChildren(form);
}

function renderTestResults() {
  saveSession();
  const correctCount = session.results.filter(Boolean).length;
  const resultView = makeElement('section', 'test-results');
  resultView.dataset.testResults = '';
  const summary = makeElement('header', 'test-summary');
  summary.dataset.testSummary = '';
  summary.append(
    makeElement('p', 'section-kicker', 'MOCK TEST'),
    makeElement('h3', '', '测试完成'),
    makeElement('p', 'summary-score', `${correctCount} / ${session.questions.length} 分`),
    makeElement('p', 'summary-topic', `${session.topic} · 答对 ${correctCount} 题`),
  );
  const back = makeElement('button', 'text-button summary-back', '返回首页');
  back.type = 'button';
  back.addEventListener('click', returnHome);
  summary.append(back);
  resultView.append(summary);

  const list = makeElement('div', 'test-result-list');
  session.questions.forEach((question, index) => {
    const correct = session.results[index];
    const item = makeElement('article', `test-result ${correct ? 'is-correct' : 'is-wrong'}`);
    item.dataset.testResult = '';
    item.append(
      makeElement('p', 'question-count', `${String(index + 1).padStart(2, '0')} · ${correct ? '回答正确' : '回答错误'}`),
      makeElement('h4', 'result-stem', question.stem),
    );
    const chosen = session.answers[index];
    item.append(makeElement('p', 'feedback-answer', `你的答案：${chosen === undefined || (Array.isArray(chosen) && !chosen.length) ? '未作答' : answerLabel(question, chosen)}`));
    if (!correct) item.append(makeElement('p', 'feedback-answer', `正确答案：${answerLabel(question, question.answer)}`));
    item.append(makeElement('p', 'feedback-explanation', question.explanation));
    appendSource(item, question);
    list.append(item);
  });
  resultView.append(list);
  practiceContent.replaceChildren(resultView);
}

function returnHome() {
  session = null;
  document.querySelector('#practice-title').textContent = '专题答题';
  practiceContent.replaceChildren(makeElement('p', 'empty-state', '选择一个学习专题开始答题。'));
  document.querySelector('#home').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.querySelector('.topic-list').addEventListener('click', (event) => {
  const link = event.target.closest('.topic-row');
  if (link) {
    event.preventDefault();
    startPractice(link.dataset.topic);
  }
});

document.querySelector('#back-home').addEventListener('click', returnHome);
document.querySelector('#clear-history').addEventListener('click', () => {
  progressStore.clear();
  historyRecords = [];
  renderHistory();
});
document.querySelector('#test-topic').addEventListener('change', updateTestAvailability);
document.querySelector('#start-test').addEventListener('click', startTest);

updateTestAvailability();
renderHistory();

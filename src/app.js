import { questionBank } from './questions.js';
import { createMockTestQuestions, getTopicQuestions, getUsableQuestions, isCorrect, selectRandomQuestions, TEST_BLUEPRINT } from './quiz-engine.js';
import { createProgressStore } from './progress-store.js';
import { createTestSession, TEST_SESSION_STORAGE_KEY } from './test-session.js';
import { clearRemoteHistory, requireActiveSession, syncHistory, userHistoryKey } from './auth-client.js';

const authState = await requireActiveSession();
if (!authState.redirected) document.body.classList.add('auth-ready');
if (authState.unavailable) document.body.classList.add('auth-unavailable');

const practiceContent = document.querySelector('#practice-content');
const historyList = document.querySelector('#history-list');
let progressStore;
try {
  progressStore = createProgressStore(window.localStorage, userHistoryKey(authState.user));
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

function learningPrompt(question) {
  return {
    '党章基础': '复习时注意区分党员义务、党员权利和党的组织原则，并以党章条文中的主体与条件为准。',
    '党员义务与纪律': '纪律类知识要结合行为性质、适用对象和情节判断，不能只凭日常用语推断处分规定。',
    '发展党员程序': '发展党员各阶段有明确的责任主体和程序节点，注意区分培养考察、政治审查、支部讨论和上级审批。',
    '时事政治与高质量发展': '时政题要分清会议决定、规划建议、规划纲要和年度政府工作部署，并留意指标对应的时间范围。',
    '党史与红色知识': '党史题注意分清会议召开时间、历史决议和重要理论成果形成的阶段。',
    '习近平关于党的建设的重要思想': '结合原文理解全面从严治党、党的组织建设和自我革命等概念之间的联系。',
    '党的二十大精神': '以大会报告原文为依据，注意区分战略目标、战略布局和中国式现代化的本质要求。',
  }[question.topic] || '作答时应回到题目所列正式文件核对概念、主体和适用条件。';
}

function appendLearningNotes(target, question) {
  const notes = makeElement('div', 'learning-notes');
  notes.append(
    makeElement('strong', 'learning-notes-title', '知识解读'),
    makeElement('p', 'feedback-explanation', question.explanation),
    makeElement('strong', 'learning-notes-title', '条文依据'),
    makeElement('p', 'feedback-explanation', question.annotation?.basis || question.source.title),
    makeElement('strong', 'learning-notes-title', '易错提醒'),
    makeElement('p', 'feedback-explanation', question.annotation?.pitfall || learningPrompt(question)),
  );
  if (question.annotation?.detail) {
    notes.append(
      makeElement('strong', 'learning-notes-title', '延伸说明'),
      makeElement('p', 'feedback-explanation', question.annotation.detail),
    );
  }
  target.append(notes);
}

function getSelectedAnswer(form, question) {
  const values = new FormData(form).getAll('answer');
  if (question.type === 'judge') return values.length ? values[0] === 'true' : undefined;
  if (question.type === 'multiple') return values;
  return values[0];
}

function updateTestAvailability() {
  const usable = getUsableQuestions(questionBank);
  const available = Object.fromEntries(Object.keys(TEST_BLUEPRINT).map((type) => [
    type,
    usable.filter((question) => question.type === type).length,
  ]));
  const missing = Object.entries(TEST_BLUEPRINT).filter(([type, required]) => available[type] < required);
  const startButton = document.querySelector('#start-test');
  const message = document.querySelector('#test-availability');
  startButton.disabled = missing.length > 0;
  message.hidden = missing.length === 0;
  message.textContent = missing.map(([type, required]) => `${questionTypeLabel(type)}需要 ${required} 道，当前 ${available[type]} 道`).join('；');
}

function saveSession() {
  if (!session || session.saved) return;
  const correctCount = session.correctCount ?? session.results.filter(Boolean).length;
  const isTest = session.mode === 'test';
  const record = {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    mode: session.mode,
    topic: session.topic,
    score: isTest ? session.results.reduce((sum, points) => sum + points, 0) : correctCount,
    total: isTest ? 100 : session.questions.length,
    questionCount: session.questions.length,
    correctCount,
    completedAt: new Date().toISOString(),
  };
  historyRecords = progressStore.add(record);
  session.saved = true;
  if (historyList) renderHistory();
  if (authState.session) {
    syncHistory(authState.session, progressStore)
      .then((records) => {
        historyRecords = records;
        if (historyList) renderHistory();
      })
      .catch(() => showHistorySyncError());
  }
}

function showHistorySyncError() {
  const status = document.querySelector('#history-sync-status');
  if (status) status.textContent = '本次记录已保存在当前设备，云端同步失败；联网后请重新登录重试。';
}

function renderHistory() {
  historyList.replaceChildren();
  if (!historyRecords.length) {
    historyList.append(makeElement('p', 'empty-state', authState.user ? '完成答题后，这里会显示账号最近 20 次学习记录。' : '完成答题后，这里会显示本机最近 20 次学习记录。'));
    return;
  }

  const list = makeElement('ol', 'history-list');
  for (const record of historyRecords) {
    const item = makeElement('li', 'history-row');
    const details = makeElement('div', 'history-details');
    details.append(makeElement('strong', '', record.topic));
    const mode = record.mode === 'test' ? '综合测试' : record.mode === 'mistakes' ? '错题重做' : '专题练习';
    const questionCount = record.questionCount || record.total;
    details.append(makeElement('span', '', `${mode} · 答对 ${record.correctCount} / ${questionCount} 题 · ${new Date(record.completedAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}`));
    item.append(details, makeElement('strong', 'history-score', `${record.score} / ${record.total} 分`));
    list.append(item);
  }
  historyList.append(list);
}

function startPractice(topic, questions = getTopicQuestions(questionBank, topic), mode = 'practice') {
  session = {
    mode,
    topic,
    questions: selectRandomQuestions(questions, questions.length),
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
    appendLearningNotes(feedback, question);
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
  const questions = createMockTestQuestions(questionBank);
  if (!questions.length) return;

  try {
    window.sessionStorage.setItem(TEST_SESSION_STORAGE_KEY, JSON.stringify(createTestSession(questions)));
    window.location.assign('exam.html');
  } catch {
    const message = document.querySelector('#test-availability');
    message.hidden = false;
    message.textContent = '浏览器未能保存本次答卷，请检查隐私设置后重试。';
  }
}

function returnHome() {
  window.location.href = 'index.html';
}

const page = document.body.dataset.page;

if (page === 'home') {
  renderHistory();
  if (authState.session) {
    syncHistory(authState.session, progressStore)
      .then((records) => {
        historyRecords = records;
        renderHistory();
      })
      .catch(() => showHistorySyncError());
  }
  document.querySelector('#clear-history').addEventListener('click', async () => {
    const clearButton = document.querySelector('#clear-history');
    clearButton.disabled = true;
    try {
      if (authState.session) await clearRemoteHistory(authState.session);
      progressStore.clear();
      historyRecords = [];
      renderHistory();
    } catch {
      showHistorySyncError();
    } finally {
      clearButton.disabled = false;
    }
  });

  const path = document.querySelector('.learning-path');
  const studySection = document.querySelector('[data-scroll-reveal]');
  if (studySection && 'IntersectionObserver' in window) {
    studySection.classList.add('has-reveal');
    const studyObserver = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      studySection.classList.add('is-visible');
      studyObserver.disconnect();
    }, { threshold: 0.18 });
    studyObserver.observe(studySection);
  }

  const stages = [...document.querySelectorAll('[data-path-stage]')];
  if (path && stages.length > 1 && 'IntersectionObserver' in window) {
    let frame = 0;
    const updatePathProgress = () => {
      frame = 0;
      const center = window.innerHeight / 2;
      const index = stages.reduce((closest, stage, stageIndex) => {
        const distance = Math.abs(stage.getBoundingClientRect().top + stage.offsetHeight / 2 - center);
        return distance < closest.distance ? { index: stageIndex, distance } : closest;
      }, { index: 0, distance: Infinity }).index;
      stages.forEach((stage, stageIndex) => {
        const active = stageIndex === index;
        stage.classList.toggle('is-current', active);
        if (active) stage.setAttribute('aria-current', 'step');
        else stage.removeAttribute('aria-current');
      });
      path.style.setProperty('--path-progress', String(index / (stages.length - 1)));
    };
    const requestPathProgress = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updatePathProgress);
    };
    const observer = new IntersectionObserver(requestPathProgress, { rootMargin: '-15% 0px -15% 0px', threshold: 0 });

    stages.forEach((stage) => observer.observe(stage));
    window.addEventListener('scroll', requestPathProgress, { passive: true });
    window.addEventListener('resize', requestPathProgress, { passive: true });
  }
}

document.querySelectorAll('.topic-row[data-topic]').forEach((link) => {
  const count = getTopicQuestions(questionBank, link.dataset.topic).length;
  const countLabel = link.querySelector('.topic-count');
  const description = link.querySelector('.topic-body small');
  if (countLabel) countLabel.textContent = `${count} 题`;
  if (description && document.body.dataset.page === 'practice') description.textContent = `${count} 道题`;
});

if (page === 'practice') {
  document.querySelector('.practice-topics .topic-list').addEventListener('click', (event) => {
    const link = event.target.closest('.topic-row');
    if (link) {
      event.preventDefault();
      const topic = link.dataset.topic;
      history.replaceState(null, '', `practice.html?topic=${encodeURIComponent(topic)}`);
      startPractice(topic);
    }
  });

  const topic = new URLSearchParams(window.location.search).get('topic');
  if (topic && getTopicQuestions(questionBank, topic).length) startPractice(topic);
}

if (page === 'test') {
  document.querySelector('#start-test').addEventListener('click', startTest);
  updateTestAvailability();
}

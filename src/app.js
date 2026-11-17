import { questionBank } from './questions.js';
import { createMockTestQuestions, getTopicQuestions, getUsableQuestions, TEST_BLUEPRINT } from './quiz-engine.js';
import { createProgressStore } from './progress-store.js';
import { answerPracticeQuestion, createPracticeSession, createPracticeStore, getPracticeProgress, getPracticeQuestionPage, goToPracticeQuestion, movePracticeQuestion } from './practice-session.js';
import { createTestSession, TEST_SESSION_STORAGE_KEY } from './test-session.js';
import { clearRemoteHistory, requireActiveSession, syncHistory, userHistoryKey } from './auth-client.js';

const authState = await requireActiveSession();
if (!authState.redirected) document.body.classList.add('auth-ready');
if (authState.unavailable) document.body.classList.add('auth-unavailable');

const practiceContent = document.querySelector('#practice-content');
const historyList = document.querySelector('#history-list');
let progressStore;
let practiceStore;
try {
  progressStore = createProgressStore(window.localStorage, userHistoryKey(authState.user));
  practiceStore = createPracticeStore(window.localStorage, authState.user?.id);
} catch {
  progressStore = createProgressStore(null);
  practiceStore = createPracticeStore(null, authState.user?.id);
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
  if (session.mode !== 'test' && !getPracticeProgress(session).complete) return;
  const correctCount = session.correctCount ?? session.results.filter(Boolean).length;
  const isTest = session.mode === 'test';
  const record = {
    id: session.id,
    mode: session.mode,
    topic: session.topic,
    score: isTest ? session.results.reduce((sum, points) => sum + points, 0) : correctCount,
    total: isTest ? 100 : session.questions.length,
    questionCount: session.questions.length,
    correctCount,
    completedAt: new Date().toISOString(),
  };
  historyRecords = progressStore.list().some((item) => item.id === record.id)
    ? progressStore.list() : progressStore.add(record);
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

function savePracticeProgress() {
  const saved = practiceStore.save(session);
  const overview = document.querySelector('#practice-overview');
  const status = document.querySelector('#practice-save-status');
  const statusLabel = document.querySelector('#practice-save-label');
  if (overview) overview.hidden = !session || !session.questions.length || session.view === 'summary';
  status.hidden = false;
  statusLabel.textContent = saved ? '已保存' : '未保存';
  status.title = saved ? '练习进度已保存在此浏览器' : '当前浏览器无法保存进度，请勿关闭页面。';
  status.classList.toggle('is-unavailable', !saved);
}

function renderPracticeOverview(requestedPage) {
  const progress = getPracticeProgress(session);
  const count = session.questions.length;
  const answered = progress.answeredCount;
  const mapGrid = document.querySelector('#practice-map-grid');
  const defaultPage = Math.floor(session.currentIndex / 30);
  const activePage = getPracticeQuestionPage(session, Number.isInteger(requestedPage) ? requestedPage : defaultPage);
  mapGrid.dataset.page = String(activePage.page);
  const bar = document.querySelector('#practice-progress-track');
  const fill = document.querySelector('#practice-progress-fill');
  bar.setAttribute('aria-valuemax', String(count));
  bar.setAttribute('aria-valuenow', String(answered));
  bar.setAttribute('aria-valuetext', `已提交 ${answered} / ${count} 题`);
  fill.style.transform = `scaleX(${count ? answered / count : 0})`;
  document.querySelector('#practice-progress-caption').textContent = `已完成 ${answered} / ${count} 题`;
  document.querySelector('#practice-question-map summary').setAttribute('aria-label', `答题卡，已完成 ${answered} / ${count} 题，当前第 ${session.currentIndex + 1} 题`);
  const unanswered = document.querySelector('#practice-next-unanswered');
  unanswered.textContent = progress.complete ? '查看本轮结果' : '继续未答';
  unanswered.disabled = progress.complete && session.view === 'summary';
  unanswered.dataset.complete = String(progress.complete);

  mapGrid.replaceChildren();
  for (const item of activePage.items) {
    const label = item.state === 'correct' ? '已答对' : item.state === 'incorrect' ? '已答错' : item.state === 'draft' ? '已选未提交' : '未作答';
    const button = makeElement('button', `practice-map-item is-${item.state}`, String(item.index + 1));
    button.type = 'button';
    button.dataset.questionIndex = String(item.index);
    button.setAttribute('aria-label', `第 ${item.index + 1} 题，${label}${item.current ? '，当前题目' : ''}`);
    if (item.current) button.setAttribute('aria-current', 'step');
    mapGrid.append(button);
  }

  const pager = getPracticeQuestionPage(session, activePage.page);
  const start = pager.page * 30 + 1;
  const end = pager.page * 30 + pager.items.length;
  document.querySelector('#practice-map-range').textContent = `${start}–${end} / ${count}`;
  document.querySelector('#practice-map-prev').disabled = pager.page === 0;
  document.querySelector('#practice-map-next').disabled = pager.page === pager.pageCount - 1;
  document.querySelector('#practice-map-prev').dataset.page = String(pager.page - 1);
  document.querySelector('#practice-map-next').dataset.page = String(pager.page + 1);
  document.querySelectorAll('.practice-topics .topic-row').forEach((link) => {
    if (link.dataset.topic === session.topic) {
      const description = link.querySelector('.topic-body small');
      if (description) description.textContent = `${getTopicQuestions(questionBank, session.topic).length} 题${answered ? ` · 已答 ${answered}` : ''}`;
    }
  });
}

function startPractice(topic, questions = getTopicQuestions(questionBank, topic), mode = 'practice', { fresh = mode === 'mistakes', scroll = true } = {}) {
  session = (!fresh && practiceStore.load(topic, questionBank, mode)) || createPracticeSession(topic, questions, mode);
  const params = new URLSearchParams({ topic });
  if (mode === 'mistakes') params.set('mode', 'mistakes');
  history.replaceState(null, '', `practice.html?${params}`);
  document.querySelector('#practice-map-grid').dataset.page = String(Math.floor(session.currentIndex / 30));
  document.querySelector('#practice-title').textContent = topic;
  document.querySelectorAll('.practice-topics .topic-row').forEach((link) => {
    const active = link.dataset.topic === topic;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });

  if (!session.questions.length) {
    practiceContent.replaceChildren(makeElement('p', 'empty-state', '这个专题暂时没有题目。'));
  } else if (session.view === 'summary') {
    renderPracticeSummary();
  } else {
    renderQuestion();
  }
  if (session.questions.length && session.view !== 'summary') renderPracticeOverview();
  savePracticeProgress();
  if (scroll) document.querySelector('#practice').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderQuestion() {
  const question = session.questions[session.currentIndex];
  const answered = typeof session.results[session.currentIndex] === 'boolean';
  const progress = getPracticeProgress(session);
  practiceContent.replaceChildren();

  const panel = makeElement('article', 'question-panel');
  panel.dataset.practiceQuestion = '';
  if (session.motion) {
    panel.dataset.motion = session.motion;
    session.motion = null;
  }
  const meta = makeElement('div', 'question-meta');
  meta.append(
    makeElement('span', 'question-count', `第 ${session.currentIndex + 1} / ${session.questions.length} 题`),
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
    input.disabled = answered;
    const selected = session.answers[session.currentIndex];
    input.checked = Array.isArray(selected) ? selected.includes(option.id) : selected !== null && selected !== undefined && String(selected) === option.id;
    row.append(input, makeElement('span', '', option.text));
    fieldset.append(row);
    inputs.push(input);
  }
  form.append(fieldset);

  if (!answered) {
    const error = makeElement('p', 'answer-error', '请先选择答案。');
    error.hidden = true;
    error.setAttribute('role', 'alert');
    error.id = `answer-error-${question.id}`;
    fieldset.setAttribute('aria-describedby', error.id);
    inputs.forEach((input) => input.addEventListener('change', () => {
      error.hidden = true;
      inputs.forEach((option) => option.removeAttribute('aria-invalid'));
      answerPracticeQuestion(session, getSelectedAnswer(form, question));
      if (page === 'practice') renderPracticeOverview();
      savePracticeProgress();
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
      if (!answerPracticeQuestion(session, answer, true)) return;
      if (page === 'practice') renderPracticeOverview();
      savePracticeProgress();
      renderQuestion();
    });
  }
  panel.append(form);

  if (answered) {
    const correct = session.results[session.currentIndex];
    const feedback = makeElement('section', `answer-feedback ${correct ? 'is-correct' : 'is-wrong'}`);
    feedback.dataset.feedback = '';
    feedback.setAttribute('aria-live', 'polite');
    feedback.append(makeElement('strong', 'feedback-status', correct ? '回答正确' : '回答错误'));
    if (!correct) feedback.append(makeElement('p', 'feedback-answer', `正确答案：${answerLabel(question, question.answer)}`));
    appendLearningNotes(feedback, question);
    appendSource(feedback, question);
    panel.append(feedback);
  }

  const navigation = makeElement('nav', 'practice-navigation');
  navigation.setAttribute('aria-label', '练习题目导航');
  const previous = makeElement('button', 'button button-quiet', '上一题');
  previous.type = 'button';
  previous.dataset.action = 'previous-question';
  previous.disabled = session.currentIndex === 0;
  const lastQuestion = session.currentIndex === session.questions.length - 1;
  const next = makeElement('button', 'button button-quiet', !lastQuestion ? '下一题' : progress.complete ? '查看本轮结果' : '继续未答题');
  next.type = 'button';
  next.dataset.action = 'next-question';
  const navigate = (direction, event) => {
    movePracticeQuestion(session, direction);
    session.motion = event?.detail ? direction < 0 ? 'previous' : 'next' : '';
    document.querySelector('#practice-question-map').open = false;
    savePracticeProgress();
    renderQuestion();
    renderPracticeOverview();
    const stem = practiceContent.querySelector('.question-stem');
    stem.setAttribute('tabindex', '-1');
    stem.focus({ preventScroll: true });
    practiceContent.scrollIntoView({ block: 'nearest' });
  };
  previous.addEventListener('click', (event) => navigate(-1, event));
  next.addEventListener('click', (event) => {
    if (!lastQuestion) navigate(1, event);
    else if (progress.complete) renderPracticeSummary();
    else navigate(progress.firstUnanswered - session.currentIndex);
  });
  navigation.append(previous, next);
  panel.append(navigation);
  practiceContent.append(panel);
}

function renderPracticeSummary() {
  if (!getPracticeProgress(session).complete) return;
  session.view = 'summary';
  saveSession();
  savePracticeProgress();
  const correctCount = session.results.filter(Boolean).length;
  const wrongQuestions = session.questions.filter((_question, index) => session.results[index] === false);
  const summary = makeElement('section', 'practice-summary');
  summary.dataset.practiceSummary = '';
  summary.append(
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

  const restart = makeElement('button', 'button button-quiet', '再练一轮');
  restart.type = 'button';
  restart.dataset.action = 'restart-practice';
  restart.addEventListener('click', () => startPractice(session.topic, session.questions, session.mode, { fresh: true }));
  summary.append(restart);

  const back = makeElement('button', 'text-button summary-back', '返回首页');
  back.type = 'button';
  back.addEventListener('click', returnHome);
  summary.append(back);
  practiceContent.replaceChildren(summary);
  if (page === 'practice') renderPracticeOverview();
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
  const savedSession = page === 'practice' ? practiceStore.load(link.dataset.topic, questionBank) : null;
  const savedCount = savedSession ? getPracticeProgress(savedSession).answeredCount : 0;
  if (countLabel) countLabel.textContent = `${count} 题`;
  if (description && page === 'practice') description.textContent = `${count} 题${savedCount ? ` · 已答 ${savedCount}` : ''}`;
});

if (page === 'practice') {
  document.querySelector('.practice-topics .topic-list').addEventListener('click', (event) => {
    const link = event.target.closest('.topic-row');
    if (link) {
      event.preventDefault();
      const topic = link.dataset.topic;
      startPractice(topic);
    }
  });

  document.querySelector('#practice-first-topic').addEventListener('click', () => {
    document.querySelector('.practice-topics .topic-row[data-topic="党章基础"]').click();
  });

  document.querySelector('#practice-map-grid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-question-index]');
    const previousIndex = session?.currentIndex;
    if (!button || !session || !goToPracticeQuestion(session, Number(button.dataset.questionIndex))) return;
    session.motion = event.detail ? Number(button.dataset.questionIndex) < previousIndex ? 'previous' : 'next' : '';
    savePracticeProgress();
    renderQuestion();
    renderPracticeOverview();
    document.querySelector('#practice-question-map').open = false;
    const stem = practiceContent.querySelector('.question-stem');
    stem.setAttribute('tabindex', '-1');
    stem.focus({ preventScroll: true });
    practiceContent.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  document.querySelector('#practice-map-prev').addEventListener('click', () => {
    const currentPage = Number(document.querySelector('#practice-map-grid').dataset.page || 0);
    const map = document.querySelector('#practice-question-map');
    map.open = true;
    renderPracticeOverview(currentPage - 1);
    document.querySelector('#practice-map-grid').querySelector('.practice-map-item')?.focus();
  });
  document.querySelector('#practice-map-next').addEventListener('click', () => {
    const currentPage = Number(document.querySelector('#practice-map-grid').dataset.page || 0);
    const nextPage = Math.max(0, Math.min(Math.ceil(session.questions.length / 30) - 1, currentPage + 1));
    const map = document.querySelector('#practice-question-map');
    map.open = true;
    renderPracticeOverview(nextPage);
    document.querySelector('#practice-map-grid').querySelector('.practice-map-item')?.focus();
  });
  document.querySelector('#practice-next-unanswered').addEventListener('click', () => {
    const progress = getPracticeProgress(session);
    if (progress.complete) {
      renderPracticeSummary();
      return;
    }
    goToPracticeQuestion(session, progress.firstUnanswered);
    document.querySelector('#practice-question-map').open = false;
    savePracticeProgress();
    renderQuestion();
    renderPracticeOverview();
    const stem = practiceContent.querySelector('.question-stem');
    stem.setAttribute('tabindex', '-1');
    stem.focus({ preventScroll: true });
    practiceContent.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  const params = new URLSearchParams(window.location.search);
  const topic = params.get('topic');
  const mode = params.get('mode') === 'mistakes' ? 'mistakes' : 'practice';
  const last = practiceStore.last();
  if (topic && getTopicQuestions(questionBank, topic).length) {
    const activeMode = mode === 'mistakes' && practiceStore.load(topic, questionBank, mode) ? mode : 'practice';
    startPractice(topic, undefined, activeMode, { fresh: false, scroll: false });
  } else if (!topic && last && getTopicQuestions(questionBank, last.topic).length) {
    startPractice(last.topic, undefined, last.mode, { fresh: false, scroll: false });
  }
}

if (page === 'test') {
  document.querySelector('#start-test').addEventListener('click', startTest);
  updateTestAvailability();
}

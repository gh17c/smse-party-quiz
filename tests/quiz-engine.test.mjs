import assert from 'node:assert/strict';
import test from 'node:test';
import { createMockTestQuestions, getMaximumPoints, getQuestionPoints, getTopicNames, getTopicQuestions, getUsableQuestions, isCorrect, isCurrentAffairsQuestion, MAX_CURRENT_AFFAIRS_POINTS, normalizeAnswer, selectRandomQuestions, TEST_BLUEPRINT } from '../src/quiz-engine.js';
import { questionBank } from '../src/questions.js';

const question = (type, answer) => ({ type, answer });

test('single-choice and judge answers require an exact match', () => {
  assert.equal(isCorrect(question('single', 'b'), 'b'), true);
  assert.equal(isCorrect(question('single', 'b'), 'a'), false);
  assert.equal(isCorrect(question('judge', true), true), true);
  assert.equal(isCorrect(question('judge', true), false), false);
});

test('multiple-choice answers match as a complete set regardless of order', () => {
  const item = question('multiple', ['a', 'c']);
  assert.deepEqual(normalizeAnswer(item, ['c', 'a', 'a']), ['a', 'c']);
  assert.equal(isCorrect(item, ['c', 'a']), true);
  assert.equal(isCorrect(item, ['a']), false);
  assert.equal(isCorrect(item, ['a', 'b', 'c']), false);
});

test('mock test points follow single, partial multiple, wrong multiple, and judge rules', () => {
  const single = question('single', 'B');
  const multiple = question('multiple', ['A', 'C']);
  const judge = question('judge', true);

  assert.equal(getQuestionPoints(single, 'B'), 2);
  assert.equal(getQuestionPoints(single, 'A'), 0);
  assert.equal(getQuestionPoints(multiple, ['C', 'A']), 3);
  assert.equal(getQuestionPoints(multiple, ['A']), 1);
  assert.equal(getQuestionPoints(multiple, []), 0);
  assert.equal(getQuestionPoints(multiple, ['A', 'B']), 0);
  assert.equal(getQuestionPoints(judge, true), 1);
  assert.equal(getQuestionPoints(judge, false), 0);
  assert.equal(getMaximumPoints(single) * TEST_BLUEPRINT.single
    + getMaximumPoints(multiple) * TEST_BLUEPRINT.multiple
    + getMaximumPoints(judge) * TEST_BLUEPRINT.judge, 100);
});

test('random mock paper has the 100-point type mix and rejects undersized pools', () => {
  const pool = [
    ...Array.from({ length: 30 }, (_, index) => ({ id: `s${index}`, type: 'single', topic: 't', stem: 's', options: [{ id: 'A', text: 'a' }], answer: 'A', explanation: 'e', source: { title: 'source', url: 'https://example.org' } })),
    ...Array.from({ length: 12 }, (_, index) => ({ id: `m${index}`, type: 'multiple', topic: 't', stem: 'm', options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }], answer: ['A'], explanation: 'e', source: { title: 'source', url: 'https://example.org' } })),
    ...Array.from({ length: 24 }, (_, index) => ({ id: `j${index}`, type: 'judge', topic: 't', stem: 'j', options: [], answer: true, explanation: 'e', source: { title: 'source', url: 'https://example.org' } })),
  ];
  const paper = createMockTestQuestions(pool, () => 0);
  assert.equal(paper.length, 55);
  assert.deepEqual(Object.fromEntries(['single', 'multiple', 'judge'].map((type) => [type, paper.filter((item) => item.type === type).length])), TEST_BLUEPRINT);
  assert.equal(new Set(paper.map((item) => item.id)).size, 55);
  assert.equal(paper.reduce((sum, item) => sum + getMaximumPoints(item), 0), 100);
  assert.deepEqual(createMockTestQuestions(pool.slice(1), () => 0).filter((item) => item.type === 'single').length, 25);
  assert.deepEqual(createMockTestQuestions(pool.filter((item) => item.type !== 'judge'), () => 0), []);
});

test('random mock paper caps current-affairs value at 20 points while preserving the full blueprint', () => {
  const makeQuestion = (id, type, topic, isCurrentAffairs = false) => ({
    id,
    type,
    topic,
    stem: id,
    options: type === 'judge' ? [] : [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }],
    answer: type === 'judge' ? true : type === 'multiple' ? ['A'] : 'A',
    explanation: 'e',
    source: { title: 'source', url: 'https://example.org' },
    isCurrentAffairs,
  });
  const pool = [
    ...Array.from({ length: 40 }, (_, index) => makeQuestion(`cs${index}`, 'single', 'current', true)),
    ...Array.from({ length: 40 }, (_, index) => makeQuestion(`rs${index}`, 'single', 'regular')),
    ...Array.from({ length: 20 }, (_, index) => makeQuestion(`cm${index}`, 'multiple', 'current', true)),
    ...Array.from({ length: 20 }, (_, index) => makeQuestion(`rm${index}`, 'multiple', 'regular')),
    ...Array.from({ length: 40 }, (_, index) => makeQuestion(`cj${index}`, 'judge', 'current', true)),
    ...Array.from({ length: 40 }, (_, index) => makeQuestion(`rj${index}`, 'judge', 'regular')),
  ];
  const paper = createMockTestQuestions(pool, () => 0.42);
  const currentAffairs = paper.filter(isCurrentAffairsQuestion);
  assert.equal(paper.length, 55);
  assert.equal(paper.reduce((sum, item) => sum + getMaximumPoints(item), 0), 100);
  assert.ok(currentAffairs.reduce((sum, item) => sum + getMaximumPoints(item), 0) <= MAX_CURRENT_AFFAIRS_POINTS);
  assert.deepEqual(Object.fromEntries(['single', 'multiple', 'judge'].map((type) => [type, paper.filter((item) => item.type === type).length])), TEST_BLUEPRINT);
});

test('topic selection excludes malformed questions and returns an empty list for missing topics', () => {
  const valid = {
    id: 'good', topic: '党章基础', type: 'single', stem: '题干',
    options: [{ id: 'A', text: '答案' }], answer: 'A', explanation: '解析',
    source: { title: '来源', url: 'https://example.org/source' },
  };
  const malformed = { ...valid, id: 'bad', answer: 'missing-option' };
  const malformedSource = { ...valid, id: 'bad-source', source: { title: '来源', url: {} } };
  const malformedOption = { ...valid, id: 'bad-option', options: [{ id: 'A', text: 1 }] };
  assert.deepEqual(getTopicQuestions([valid, malformed, malformedSource, malformedOption], '党章基础'), [valid]);
  assert.deepEqual(getTopicQuestions([valid], '不存在的专题'), []);
  assert.deepEqual(getTopicQuestions(null, '党章基础'), []);
  assert.deepEqual(getUsableQuestions([valid, null, malformed]), [valid]);
  assert.deepEqual(getTopicNames([valid, null, malformed]), ['党章基础']);
});

test('random question selection is repeatable with an injected random source', () => {
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const picked = selectRandomQuestions(items, 2, () => 0);
  assert.deepEqual(picked.map(({ id }) => id), ['b', 'c']);
  assert.equal(new Set(picked.map(({ id }) => id)).size, 2);
});

test('curated bank has about 200 usable questions in each study topic', () => {
  assert.ok(new Set(questionBank.map(({ topic }) => topic)).size >= 4);
  assert.deepEqual(new Set(questionBank.map(({ type }) => type)), new Set(['single', 'multiple', 'judge']));
  assert.ok(questionBank.every(({ source }) => source?.title && source.url.startsWith('https://')));
  assert.ok(questionBank.filter(({ type }) => type === 'single').length >= TEST_BLUEPRINT.single);
  assert.ok(questionBank.filter(({ type }) => type === 'multiple').length >= TEST_BLUEPRINT.multiple);
  assert.ok(questionBank.filter(({ type }) => type === 'judge').length >= TEST_BLUEPRINT.judge);

  const topicCounts = Object.fromEntries(getTopicNames(questionBank).map((topic) => [topic, getTopicQuestions(questionBank, topic).length]));
  assert.deepEqual(topicCounts, {
    '党章基础': 204,
    '党员义务与纪律': 204,
    '发展党员程序': 249,
    '时事政治与高质量发展': 231,
    '党史与红色知识': 50,
    '习近平关于党的建设的重要思想': 30,
    '党的二十大精神': 40,
  });
  assert.equal(questionBank.length, 1008);
  assert.equal(new Set(questionBank.map(({ id }) => id)).size, questionBank.length);
  assert.ok(questionBank.every(({ annotation }) => annotation?.basis && annotation?.pitfall));
  assert.ok(questionBank.every(({ annotation }) => annotation.pitfall.includes('易错辨析：')));
});

test('expanded constitution and discipline questions use verified article references and scoped wording', () => {
  const byId = (id) => questionBank.find((item) => item.id === id);
  assert.equal(byId('cx24s').annotation.basis, '第十条第二项');
  assert.match(byId('cx24s').options.map(({ text }) => text).join(' '), /除派出的代表机关和在非党组织中的党组外/);
  assert.equal(byId('cx29s').annotation.basis, '第十七条');
  assert.equal(byId('cx30s').annotation.basis, '第四十五条');
  assert.equal(byId('cx31s').annotation.basis, '第十八条');
  assert.equal(byId('cx33s').annotation.basis, '第十六条');
  assert.equal(byId('cx35s').annotation.basis, '第二十二条');
  assert.equal(byId('cx37s').annotation.basis, '第十九条');
  assert.equal(byId('cx38s').annotation.basis, '第二十二条');
  assert.equal(byId('cx39s').annotation.basis, '第二十三条');
  assert.equal(byId('cx40s').annotation.basis, '第二十四条');
  assert.equal(byId('cx41s').annotation.basis, '第二十五条');
  assert.equal(byId('cx42s').annotation.basis, '第二十八条');
  assert.match(byId('dx28s').explanation, /损害群众利益/);
});

test('random mock paper does not test the same knowledge concept more than once', () => {
  const paper = createMockTestQuestions(questionBank, () => 0.37);
  assert.equal(paper.length, 55);
  assert.equal(new Set(paper.map((item) => item.conceptId || item.id)).size, 55);
  assert.deepEqual(Object.fromEntries(['single', 'multiple', 'judge'].map((type) => [type, paper.filter((item) => item.type === type).length])), TEST_BLUEPRINT);
});

test('imported questions have traceable sources and corrected conference explanations', () => {
  const byId = (id) => questionBank.find((item) => item.id === id);
  assert.equal(byId('imported-189').topic, '时事政治与高质量发展');
  assert.match(byId('imported-189').explanation, /伟大工程、新的伟大工程/);
  assert.match(byId('imported-199').explanation, /长远之策、根本之策/);
  assert.match(byId('imported-192').stem, /习近平总书记关于党的建设的重要思想/);
  assert.ok(questionBank.filter((item) => item.id.startsWith('imported-')).every(({ source }) => source.url.startsWith('https://')));
});

test('party discipline categories exclude exam and competition rules', () => {
  const question = questionBank.find(({ id }) => id === 'd06');
  assert.deepEqual(question.answer, ['A', 'B', 'C']);
  assert.equal(isCorrect(question, ['A', 'B', 'C']), true);
  assert.equal(isCorrect(question, ['A', 'B', 'C', 'D']), false);
});

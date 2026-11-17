import { AUTH_CONFIG, isAuthConfigured } from './auth-config.js';

const SESSION_KEY = 'smse-party-quiz-auth-session';
const HISTORY_TABLE = 'quiz_history';
const HISTORY_COLUMNS = 'id,mode,topic,score,total,question_count,correct_count,completed_at';
const STUDENT_EMAIL_DOMAIN = 'students.smse-party-quiz.invalid';

export function studentLoginEmail(studentId) {
  const normalizedId = String(studentId || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(normalizedId)) {
    throw new Error('请输入有效的学号。');
  }
  return `${normalizedId}@${STUDENT_EMAIL_DOMAIN}`;
}

function readStoredSession() {
  try {
    return JSON.parse(window.localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveStoredSession(session) {
  try {
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
  } catch {
    throw new Error('浏览器无法保存登录状态，请检查存储空间或隐私设置。');
  }
}

function authUrl(path) {
  return `${AUTH_CONFIG.supabaseUrl.replace(/\/$/, '')}${path}`;
}

async function request(path, { token, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(authUrl(path), {
    method,
    headers: {
      apikey: AUTH_CONFIG.anonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.msg || payload?.message || payload?.error_description || payload?.error || '服务暂时不可用，请稍后重试。');
    error.status = response.status;
    error.code = payload?.error_code || payload?.code;
    throw error;
  }
  return payload;
}

function sessionExpiry(session) {
  if (Number.isFinite(session.expires_at)) return session.expires_at * 1000;
  return Date.now() + (Number(session.expires_in) || 3600) * 1000;
}

async function refreshSession(session) {
  if (!session?.refresh_token) return null;
  try {
    const refreshed = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token },
    });
    saveStoredSession(refreshed);
    return refreshed;
  } catch (error) {
    if (error.status === 400 || error.status === 401) {
      saveStoredSession(null);
      return null;
    }
    throw error;
  }
}

export async function getActiveSession() {
  if (!isAuthConfigured) return { session: null, user: null };
  let session = readStoredSession();
  if (!session?.access_token) return { session: null, user: null };

  if (sessionExpiry(session) < Date.now() + 60_000) {
    session = await refreshSession(session);
    if (!session) return { session: null, user: null };
  }

  try {
    const user = await request('/auth/v1/user', { token: session.access_token });
    return { session, user };
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      saveStoredSession(null);
      return { session: null, user: null };
    }
    throw error;
  }
}

export async function signIn(studentId, password) {
  if (!isAuthConfigured) throw new Error('登录服务尚未配置，请联系网站管理员。');
  if (!password) throw new Error('请输入密码。');
  const session = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: studentLoginEmail(studentId), password },
  });
  saveStoredSession(session);
  return session;
}

export async function signUp(studentId, fullName, password) {
  if (!isAuthConfigured) throw new Error('登录服务尚未配置，请联系网站管理员。');
  const email = studentLoginEmail(studentId);
  const name = String(fullName || '').trim();
  if (!name || name.length > 40 || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw new Error('请填写真实姓名，最多 40 个字。');
  }
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error('密码至少需要 6 位。');
  }
  let session;
  try {
    session = await request('/auth/v1/signup', {
      method: 'POST',
      body: { email, password, data: { student_id: email.split('@')[0], full_name: name } },
    });
  } catch (error) {
    if (['user_already_exists', 'email_exists'].includes(error.code) || /already registered/i.test(error.message)) {
      throw new Error('该学号已注册，请直接登录；忘记密码请联系管理员。');
    }
    if (error.code === 'signup_disabled') throw new Error('注册暂未开放，请联系管理员。');
    throw error;
  }
  if (!session?.access_token || !session?.user?.id) {
    if (session?.identities?.length === 0) throw new Error('该学号已注册，请直接登录。');
    throw new Error('注册尚未完成：请管理员检查是否已关闭邮箱确认。');
  }
  saveStoredSession(session);
  return session;
}

export async function signOut() {
  const session = readStoredSession();
  try {
    if (session?.access_token && isAuthConfigured) {
      await request('/auth/v1/logout', { method: 'POST', token: session.access_token });
    }
  } finally {
    saveStoredSession(null);
    window.sessionStorage.removeItem('smse-party-quiz-test-session');
  }
}

export function userHistoryKey(user) {
  return user ? `smse-party-quiz-history:${user.id}` : 'smse-party-quiz-history';
}

function toRemoteRecord(record) {
  return {
    id: String(record.id),
    mode: record.mode,
    topic: record.topic,
    score: record.score,
    total: record.total,
    question_count: record.questionCount ?? record.total,
    correct_count: record.correctCount,
    completed_at: record.completedAt,
  };
}

function fromRemoteRecord(record) {
  return {
    id: record.id,
    mode: record.mode,
    topic: record.topic,
    score: Number(record.score),
    total: Number(record.total),
    questionCount: Number(record.question_count),
    correctCount: Number(record.correct_count),
    completedAt: record.completed_at,
  };
}

export async function syncHistory(session, store) {
  if (!session?.access_token || !store || !isAuthConfigured) return store?.list() || [];
  const remote = await request(`/rest/v1/${HISTORY_TABLE}?select=${HISTORY_COLUMNS}&order=completed_at.desc&limit=20`, {
    token: session.access_token,
  });
  const merged = new Map();
  for (const record of [...store.list(), ...remote.map(fromRemoteRecord)]) {
    if (!merged.has(record.id)) merged.set(record.id, record);
  }
  const records = [...merged.values()]
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))
    .slice(0, 20);
  store.replace(records);

  if (records.length) {
    await request(`/rest/v1/${HISTORY_TABLE}?on_conflict=id`, {
      token: session.access_token,
      method: 'POST',
      body: records.map(toRemoteRecord),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  }
  return records;
}

export async function clearRemoteHistory(session) {
  if (!session?.access_token || !isAuthConfigured) return;
  await request(`/rest/v1/${HISTORY_TABLE}?user_id=eq.${encodeURIComponent(session.user.id)}`, {
    token: session.access_token,
    method: 'DELETE',
  });
}

export async function requireActiveSession() {
  if (!isAuthConfigured || !AUTH_CONFIG.requireLogin) return { enabled: false, session: null, user: null };
  let active;
  try {
    active = await getActiveSession();
  } catch {
    document.body.classList.add('auth-ready', 'auth-unavailable');
    const status = document.createElement('p');
    status.className = 'auth-page-error';
    status.textContent = '暂时无法连接登录服务，请检查网络后刷新页面。';
    document.querySelector('main')?.prepend(status);
    return { enabled: true, session: null, user: null, unavailable: true };
  }
  if (!active.user) {
    const next = `${window.location.pathname.split('/').pop() || 'index.html'}${window.location.search}`;
    window.location.replace(`login.html?next=${encodeURIComponent(next)}`);
    return { enabled: true, session: null, user: null, redirected: true };
  }
  document.body.classList.add('auth-ready');
  addAccountControl(active.user);
  return { enabled: true, ...active };
}

function addAccountControl(user) {
  const header = document.querySelector('.header-inner');
  if (!header || header.querySelector('.account-control')) return;
  const control = document.createElement('div');
  control.className = 'account-control';
  const email = document.createElement('span');
  const studentId = user.email?.split('@')[0] || '';
  const name = user.user_metadata?.full_name || user.user_metadata?.name;
  email.textContent = name ? `${name} · ${studentId}` : studentId || '已登录';
  email.title = name ? `${name} · ${studentId}` : studentId;
  const button = document.createElement('button');
  button.className = 'account-signout';
  button.type = 'button';
  button.textContent = '退出登录';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await signOut();
    } finally {
      window.location.assign('login.html');
    }
  });
  control.append(email, button);
  header.append(control);
}

export function authErrorMessage(error) {
  const message = String(error?.message || '登录失败，请稍后重试。');
  if (error?.status === 400 || error?.status === 401) return '学号或密码不正确；首次使用请先注册。';
  if (error?.status === 429) return '尝试次数过多，请稍后再试。';
  if (error?.status === 0 || /failed to fetch|network/i.test(message)) return '网络连接失败，请检查网络后重试。';
  return message;
}

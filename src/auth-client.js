import { AUTH_CONFIG, isAuthConfigured } from './auth-config.js';

const SESSION_KEY = 'smse-party-quiz-auth-session';
const HISTORY_TABLE = 'quiz_history';
const HISTORY_COLUMNS = 'id,mode,topic,score,total,question_count,correct_count,completed_at';

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

export function acceptAuthCallback() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');
  if (!accessToken || !refreshToken || !['invite', 'recovery'].includes(type)) return null;
  const expiresIn = Number(params.get('expires_in')) || 3600;
  saveStoredSession({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    token_type: params.get('token_type') || 'bearer',
  });
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  return { type };
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
    error.code = payload?.code;
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

export async function signIn(email, password) {
  if (!isAuthConfigured) throw new Error('登录服务尚未配置，请联系网站管理员。');
  if (!email.trim() || !password) throw new Error('请输入邮箱和密码。');
  const session = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: email.trim(), password },
  });
  saveStoredSession(session);
  return session;
}

export async function setAccountPassword(password) {
  if (!isAuthConfigured) throw new Error('登录服务尚未配置，请联系网站管理员。');
  const session = readStoredSession();
  if (!session?.access_token) throw new Error('邀请链接已失效，请联系网站管理员重新发送。');
  await request('/auth/v1/user', {
    method: 'PUT',
    token: session.access_token,
    body: { password },
  });
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
  email.textContent = user.email || '已登录';
  email.title = user.email || '';
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
  if (error?.status === 400 || error?.status === 401) return '邮箱或密码不正确，或账号尚未由管理员启用。';
  if (error?.status === 429) return '尝试次数过多，请稍后再试。';
  if (error?.status === 0 || /failed to fetch|network/i.test(message)) return '网络连接失败，请检查网络后重试。';
  return message;
}

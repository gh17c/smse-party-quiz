import { AUTH_CONFIG, isAuthConfigured } from './auth-config.js';
import { authErrorMessage, getActiveSession, signIn } from './auth-client.js';

const form = document.querySelector('#login-form');
const studentIdInput = document.querySelector('#login-student-id');
const passwordInput = document.querySelector('#login-password');
const status = document.querySelector('#login-status');
const submit = document.querySelector('#login-submit');
const returnPath = new URLSearchParams(window.location.search).get('next');
const safeReturnPath = returnPath && !returnPath.includes('://') && !returnPath.startsWith('//')
  ? returnPath
  : 'index.html';
function showStatus(message, kind = 'error') {
  status.textContent = message;
  status.dataset.kind = kind;
}

if (!isAuthConfigured) {
  form.hidden = true;
  showStatus('登录服务尚未配置，请联系网站管理员。');
} else if (!AUTH_CONFIG.requireLogin) {
  showStatus('登录尚未启用，请联系网站管理员。');
  form.hidden = true;
} else {
  getActiveSession().then(({ user }) => {
    if (user) window.location.replace(safeReturnPath);
  }).catch(() => showStatus('暂时无法连接登录服务，请检查网络后重试。'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    showStatus('正在验证账号…', 'pending');
    try {
      await signIn(studentIdInput.value, passwordInput.value);
      window.location.replace(safeReturnPath);
    } catch (error) {
      showStatus(authErrorMessage(error));
      passwordInput.select();
    } finally {
      submit.disabled = false;
    }
  });
}

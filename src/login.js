import { AUTH_CONFIG, isAuthConfigured } from './auth-config.js';
import { acceptAuthCallback, authErrorMessage, getActiveSession, setAccountPassword, signIn } from './auth-client.js';

const form = document.querySelector('#login-form');
const emailInput = document.querySelector('#login-email');
const passwordInput = document.querySelector('#login-password');
const confirmInput = document.querySelector('#login-confirm');
const emailField = document.querySelector('#login-email-field');
const confirmField = document.querySelector('#login-confirm-field');
const status = document.querySelector('#login-status');
const submit = document.querySelector('#login-submit');
const returnPath = new URLSearchParams(window.location.search).get('next');
const safeReturnPath = returnPath && !returnPath.includes('://') && !returnPath.startsWith('//')
  ? returnPath
  : 'index.html';
const authCallback = isAuthConfigured && AUTH_CONFIG.requireLogin ? acceptAuthCallback() : null;

if (authCallback) {
  document.querySelector('#login-title').textContent = '设置登录密码';
  document.querySelector('.login-intro').textContent = '请设置至少 8 位密码，完成账号启用。';
  document.querySelector('label[for="login-password"]').textContent = '新密码';
  passwordInput.autocomplete = 'new-password';
  emailField.hidden = true;
  emailInput.required = false;
  confirmField.hidden = false;
  confirmInput.required = true;
  submit.textContent = '确认并继续';
}

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
  if (!authCallback) {
    getActiveSession().then(({ user }) => {
      if (user) window.location.replace(safeReturnPath);
    }).catch(() => showStatus('暂时无法连接登录服务，请检查网络后重试。'));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    showStatus('正在验证账号…', 'pending');
    try {
      if (authCallback) {
        if (passwordInput.value !== confirmInput.value) throw new Error('两次输入的密码不一致。');
        await setAccountPassword(passwordInput.value);
      } else {
        await signIn(emailInput.value, passwordInput.value);
      }
      window.location.replace(safeReturnPath);
    } catch (error) {
      showStatus(authErrorMessage(error));
      passwordInput.select();
    } finally {
      submit.disabled = false;
    }
  });
}

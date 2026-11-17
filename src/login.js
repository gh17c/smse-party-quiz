import { AUTH_CONFIG, isAuthConfigured } from './auth-config.js';
import { authErrorMessage, getActiveSession, signIn, signUp } from './auth-client.js';

const form = document.querySelector('#login-form');
const studentIdInput = document.querySelector('#login-student-id');
const passwordInput = document.querySelector('#login-password');
const status = document.querySelector('#login-status');
const submit = document.querySelector('#login-submit');
const nameInput = document.querySelector('#register-name');
const nameField = document.querySelector('#register-name-field');
const passwordHint = document.querySelector('#register-password-hint');
const modeButtons = [...document.querySelectorAll('[data-auth-mode]')];
let registerMode = false;
const returnPath = new URLSearchParams(window.location.search).get('next');
const safeReturnPath = returnPath && /^(index|practice|test|exam)\.html(?:\?[^#\\]*)?$/.test(returnPath)
  ? returnPath
  : 'index.html';
function showStatus(message, kind = 'error') {
  status.textContent = message;
  status.dataset.kind = kind;
}

function setMode(mode) {
  registerMode = mode === 'register';
  modeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.authMode === mode)));
  nameField.hidden = !registerMode;
  nameInput.disabled = !registerMode;
  nameInput.required = registerMode;
  passwordInput.autocomplete = registerMode ? 'new-password' : 'current-password';
  passwordInput.minLength = registerMode ? 6 : 0;
  passwordHint.hidden = !registerMode;
  passwordInput.value = '';
  document.querySelector('#login-title').textContent = registerMode ? '学生注册' : '账号登录';
  document.querySelector('.login-intro').textContent = registerMode
    ? '填写学号和真实姓名，注册后即可开始练习。'
    : '使用学号和密码进入学习平台。';
  submit.textContent = registerMode ? '注册并进入' : '登录';
  showStatus('');
}

if (!isAuthConfigured) {
  form.hidden = true;
  showStatus('登录服务尚未配置，请联系网站管理员。');
} else if (!AUTH_CONFIG.requireLogin) {
  showStatus('登录尚未启用，请联系网站管理员。');
  form.hidden = true;
} else {
  modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.authMode)));
  if (new URLSearchParams(window.location.search).get('mode') === 'register') setMode('register');
  getActiveSession().then(({ user }) => {
    if (user) window.location.replace(safeReturnPath);
  }).catch(() => showStatus('暂时无法连接登录服务，请检查网络后重试。'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    modeButtons.forEach((button) => { button.disabled = true; });
    showStatus(registerMode ? '正在创建账号…' : '正在验证账号…', 'pending');
    try {
      if (registerMode) await signUp(studentIdInput.value, nameInput.value, passwordInput.value);
      else await signIn(studentIdInput.value, passwordInput.value);
      window.location.replace(safeReturnPath);
    } catch (error) {
      showStatus(authErrorMessage(error));
      passwordInput.select();
    } finally {
      submit.disabled = false;
      modeButtons.forEach((button) => { button.disabled = false; });
    }
  });
}

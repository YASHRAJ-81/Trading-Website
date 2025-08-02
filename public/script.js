function showTab(tab) {
  document.getElementById('register').classList.toggle('hidden', tab !== 'register');
  document.getElementById('login').classList.toggle('hidden', tab !== 'login');
  if (tab === 'login') refreshCaptcha();
}

function refreshCaptcha() {
  const captchaImg = document.getElementById('captchaImg');
  captchaImg.src = '/captcha?' + Date.now(); // prevent cache
}

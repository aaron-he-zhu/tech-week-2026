'use strict';
(() => {
  const W = window.Wishlist,
    section = document.getElementById('google-account');
  if (!section || W.readOnly) return;
  const $ = (id) => document.getElementById(id);
  let clientId = null,
    loading = false,
    scriptPromise = null,
    refreshTimer;
  const message = (text) => {
    $('google-status').textContent = text;
  };
  function render() {
    const connected = !!W.google;
    section.hidden = !clientId && !connected;
    $('google-connected').hidden = !connected;
    $('google-connect').hidden = connected;
    $('google-account-email').textContent = connected ? W.google.email || 'Google 账号' : '';
    $('wish-restore-copy').hidden = connected;
    $('wish-recovery-help').textContent = connected
      ? '在其他设备登录同一 Google 账号，即可找回记录。分享链接仅供查看。'
      : '恢复链接用于编辑你的清单，请只留给自己。分享链接仅供查看；公开名单不会链接到你的完整清单。';
    if (connected) {
      $('google-button-wrap').hidden = true;
      clearTimeout(refreshTimer);
    }
  }
  async function loadLibrary() {
    if (window.google?.accounts?.id) return;
    if (!scriptPromise)
      scriptPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        const timer = setTimeout(() => {
          script.remove();
          scriptPromise = null;
          reject(new Error('Google 登录加载超时，请重试。'));
        }, 15000);
        script.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        script.onerror = () => {
          clearTimeout(timer);
          script.remove();
          scriptPromise = null;
          reject(new Error('暂时无法连接 Google，请稍后重试。'));
        };
        document.head.append(script);
      });
    await scriptPromise;
  }
  async function prepare() {
    if (loading || !clientId) return;
    loading = true;
    $('google-start').disabled = true;
    message('正在准备 Google 登录…');
    try {
      const [challenge] = await Promise.all([W.startGoogleLogin(), loadLibrary()]);
      if (W.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        nonce: challenge.nonce,
        auto_select: false,
        ux_mode: 'popup',
        context: 'signin',
        callback: async (response) => {
          $('google-button-wrap').hidden = true;
          $('google-start').disabled = true;
          message('正在登录并同步记录…');
          try {
            await W.finishGoogleLogin({
              credential: response.credential,
              challengeId: challenge.challengeId,
            });
            message('已同步。公开昵称保持不变。');
            render();
          } catch (error) {
            message(error.message);
            $('google-start').disabled = false;
          }
        },
      });
      $('google-button').replaceChildren();
      $('google-button-wrap').hidden = false;
      window.google.accounts.id.renderButton($('google-button'), {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        locale: 'zh_CN',
        width: Math.min(300, $('google-button').clientWidth || 280),
      });
      message('请选择 Google 账号。你也可以继续免注册使用。');
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        $('google-button-wrap').hidden = true;
        message('登录入口已过期，重新点击即可。');
      }, 9 * 60000);
    } catch (error) {
      message(error.message);
    } finally {
      loading = false;
      $('google-start').disabled = false;
    }
  }
  $('google-start').addEventListener('click', prepare);
  $('google-logout').addEventListener('click', async () => {
    $('google-logout').disabled = true;
    try {
      await W.signOut();
      window.google?.accounts?.id?.disableAutoSelect();
      message('');
      render();
    } catch (error) {
      message(error.message);
    } finally {
      $('google-logout').disabled = false;
    }
  });
  document.addEventListener('wish-identity-change', render);
  Promise.all([W.ready, W.request('/v1/auth/config', { credential: '' })])
    .then(([, config]) => {
      clientId = config.googleClientId;
      render();
    })
    .catch(() => {});
})();

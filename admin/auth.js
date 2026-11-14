// ===== 鉴权：GitHub OAuth Web Flow + localStorage =====
(function () {
  const TOKEN_KEY = 'blog_admin_token';
  const USER_KEY = 'blog_admin_user';

  // OAuth App 授权端点与回调地址（client_id 公开，可放前端）
  const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
  const GITHUB_REDIRECT_URI = window.location.origin + '/admin/';

  function randomString(length) {
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function getUser() {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  // 通过 Cloudflare Worker 换 token（解决 CORS）
  async function exchangeCode(code) {
    const res = await fetch(GITHUB_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error || ('Token 交换失败 HTTP ' + res.status));
    }
    if (!data.access_token) {
      throw new Error('未获取到 access_token');
    }
    return data.access_token;
  }

  window.BlogAuth = {
    getToken,
    setToken,
    clearToken,
    getUser,
    setUser,
    exchangeCode,

    // 发起登录：跳转 GitHub 授权页
    login() {
      const params = new URLSearchParams({
        client_id: GITHUB_OAUTH_CLIENT_ID,
        redirect_uri: GITHUB_REDIRECT_URI,
        scope: 'repo',
        state: randomString(16),
      });
      window.location.href = GITHUB_AUTHORIZE_URL + '?' + params.toString();
    },

    logout() {
      clearToken();
      window.location.hash = '';
      window.location.reload();
    },
  };
})();

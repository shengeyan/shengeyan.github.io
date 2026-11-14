// ===== GitHub API 封装 =====
(function () {
  function headers(token) {
    return {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };
  }

  async function api(path, token, options = {}) {
    const res = await fetch(GITHUB_API + path, {
      ...options,
      headers: { ...headers(token), ...(options.headers || {}) },
    });
    if (!res.ok) {
      let msg = res.status + ' ' + res.statusText;
      try {
        const body = await res.json();
        if (body.message) msg = body.message;
      } catch (e) {}
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // 获取当前用户，并判断对仓库写权限
  async function getCurrentUser(token) {
    const user = await api('/user', token);
    let canWrite = false;
    try {
      const repo = await api(`/repos/${REPO_OWNER}/${REPO_NAME}`, token);
      canWrite = repo.permissions && (repo.permissions.push || repo.permissions.admin);
    } catch (e) {
      canWrite = false;
    }
    return { user, canWrite };
  }

  // 列出 source/_posts 下所有 .md 文件
  async function listPosts(token) {
    const data = await api(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${POSTS_DIR}?ref=${REPO_BRANCH}`, token);
    const files = Array.isArray(data) ? data : [];
    return files.filter((f) => f.type === 'file' && f.name.endsWith('.md'));
  }

  async function getFile(token, path) {
    const data = await api(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${REPO_BRANCH}`, token);
    if (data.type === 'file' && data.encoding === 'base64') {
      return {
        content: decodeBase64Utf8(data.content),
        sha: data.sha,
      };
    }
    throw new Error('文件读取失败或非文本类型');
  }

  // 创建或更新文件。若提供 sha 则更新，否则创建。
  async function saveFile(token, path, content, message, sha = null) {
    const body = {
      message,
      content: encodeBase64Utf8(content),
      branch: REPO_BRANCH,
    };
    if (sha) body.sha = sha;
    return api(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, token, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  // 上传二进制文件（图片等）
  async function uploadFile(token, path, bytes, message) {
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return api(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, token, {
      method: 'PUT',
      body: JSON.stringify({
        message,
        content: btoa(binary),
        branch: REPO_BRANCH,
      }),
    });
  }

  function encodeBase64Utf8(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
  }

  function decodeBase64Utf8(b64) {
    const binary = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  window.BlogApi = {
    api,
    getCurrentUser,
    listPosts,
    getFile,
    saveFile,
    uploadFile,
    encodeBase64Utf8,
    decodeBase64Utf8,
  };
})();

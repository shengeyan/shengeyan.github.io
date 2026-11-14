// ===== 主逻辑 =====
(function () {
  const $ = (id) => document.getElementById(id);

  let currentToken = null;
  let currentUser = null;
  let currentFile = null; // { name, path, sha }

  // ---- 简单的 markdown 预览（不依赖第三方库）----
  function renderMarkdown(md) {
    if (!md) return '';
    let html = md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 代码块
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
    // 行内代码
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    // 图片
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    // 链接
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // 标题
    html = html.replace(/^###### (.*)$/gm, '<h6>$1</h6>');
    html = html.replace(/^##### (.*)$/gm, '<h5>$1</h5>');
    html = html.replace(/^#### (.*)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
    // 加粗/斜体
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // 引用
    html = html.replace(/^&gt; (.*)$/gm, '<blockquote>$1</blockquote>');
    // 分隔线
    html = html.replace(/^---+$/gm, '<hr>');
    // 无序列表
    html = html.replace(/^[-*] (.*)$/gm, '<li>$1</li>');
    // 段落
    html = html.replace(/\n{2,}/g, '</p><p>');
    html = '<p>' + html + '</p>';
    return html;
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function toggleTab(write) {
    $('tabWrite').classList.toggle('active', write);
    $('tabPreview').classList.toggle('active', !write);
    $('bodyEditor').classList.toggle('hidden', !write);
    $('bodyPreview').classList.toggle('hidden', write);
  }

  function updatePreview() {
    $('bodyPreview').innerHTML = renderMarkdown($('bodyEditor').value);
  }

  // ---- 鉴权与路由：OAuth Web Flow + Worker ----
  function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return false;
    window.history.replaceState({}, '', window.location.pathname);
    BlogAuth.exchangeCode(code)
      .then((token) => {
        currentToken = token;
        BlogAuth.setToken(token);
        afterLogin(token);
      })
      .catch((err) => {
        toast('登录失败：' + err.message);
        showLogin();
      });
    return true;
  }

  function afterLogin(token) {
    BlogApi.getCurrentUser(token)
      .then(({ user, canWrite }) => {
        if (!canWrite) {
          toast('当前账号对该仓库无写权限，仅仓库所有者/协作者可发布。');
          BlogAuth.clearToken();
          showLogin();
          return;
        }
        currentUser = user;
        BlogAuth.setUser(user);
        $('userName').textContent = '@' + user.login;
        showMain();
        loadPosts();
      })
      .catch((err) => {
        toast('获取用户信息失败：' + err.message);
        showLogin();
      });
  }

  function showLogin() {
    show($('loginView'));
    hide($('mainView'));
    hide($('editorView'));
  }

  function showMain() {
    hide($('loginView'));
    show($('mainView'));
    show($('listView'));
    hide($('editorView'));
  }

  function showEditor() {
    hide($('listView'));
    show($('editorView'));
  }

  // ---- 文章列表 ----
  async function loadPosts() {
    const listEl = $('postList');
    listEl.innerHTML = '<div class="empty">加载中…</div>';
    try {
      const files = await BlogApi.listPosts(currentToken);
      if (files.length === 0) {
        listEl.innerHTML = '<div class="empty">暂无文章</div>';
        return;
      }
      // 按名称排序，逐个取 front matter 标题
      const items = await Promise.all(files.map(async (f) => {
        try {
          const { content } = await BlogApi.getFile(currentToken, f.path);
          const parsed = BlogFront.parseFrontMatter(content);
          return { file: f, title: parsed.meta.title || f.name };
        } catch (e) {
          return { file: f, title: f.name };
        }
      }));
      items.sort((a, b) => a.file.name.localeCompare(b.file.name));
      listEl.innerHTML = '';
      items.forEach((it) => {
        const div = document.createElement('div');
        div.className = 'post-item';
        div.innerHTML = `
          <div>
            <div class="t">${escapeHtml(it.title)}</div>
            <div class="d">${escapeHtml(it.file.name)}</div>
          </div>
          <button class="editBtn" data-path="${escapeHtml(it.file.path)}">编辑</button>
        `;
        div.querySelector('.editBtn').addEventListener('click', (e) => {
          e.stopPropagation();
          openEditor(it.file.path);
        });
        div.addEventListener('click', () => openEditor(it.file.path));
        listEl.appendChild(div);
      });
    } catch (err) {
      listEl.innerHTML = '<div class="empty">加载失败：' + escapeHtml(err.message) + '</div>';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
    }[c]));
  }

  // ---- 编辑器 ----
  async function openEditor(path) {
    try {
      const { content, sha } = await BlogApi.getFile(currentToken, path);
      const parsed = BlogFront.parseFrontMatter(content);
      currentFile = { name: path.split('/').pop(), path, sha };
      $('editorTitle').textContent = '编辑：' + currentFile.name;
      $('f_title').value = parsed.meta.title || '';
      $('f_date').value = parsed.meta.date || '';
      $('f_abbrlink').value = parsed.meta.abbrlink || '';
      $('f_categories').value = toCsv(parsed.meta.categories);
      $('f_tags').value = toCsv(parsed.meta.tags);
      $('bodyEditor').value = parsed.body;
      $('deleteBtn').classList.remove('hidden');
      updatePreview();
      toggleTab(true);
      showEditor();
    } catch (err) {
      toast('打开失败：' + err.message);
    }
  }

  function newPost() {
    currentFile = null;
    $('editorTitle').textContent = '新建文章';
    $('f_title').value = '';
    $('f_date').value = BlogFront.formatDate(new Date());
    $('f_abbrlink').value = '';
    $('f_categories').value = '';
    $('f_tags').value = '';
    $('bodyEditor').value = '';
    $('deleteBtn').classList.add('hidden');
    updatePreview();
    toggleTab(true);
    showEditor();
  }

  function toCsv(v) {
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean).join(', ');
    return '';
  }

  function fromCsv(s) {
    return s.split(',').map((x) => x.trim()).filter(Boolean);
  }

  async function savePost() {
    const title = $('f_title').value.trim();
    if (!title) { toast('请填写标题'); return; }
    const body = $('bodyEditor').value;
    let meta = {};
    if (currentFile) {
      meta = BlogFront.parseFrontMatter(await BlogApi.getFile(currentToken, currentFile.path).then((r) => r.content)).meta;
    }
    let abbrlink = $('f_abbrlink').value.trim();
    if (!abbrlink) {
      abbrlink = BlogFront.generateAbbrlink(title);
    }
    meta.title = title;
    meta.date = $('f_date').value.trim() || BlogFront.formatDate(new Date());
    meta.abbrlink = abbrlink;
    const categories = fromCsv($('f_categories').value);
    const tags = fromCsv($('f_tags').value);
    if (categories.length) meta.categories = categories; else delete meta.categories;
    if (tags.length) meta.tags = tags; else delete meta.tags;

    const content = BlogFront.stringifyFrontMatter(meta, body);

    let filePath;
    let sha = null;
    if (currentFile) {
      filePath = currentFile.path;
      sha = currentFile.sha;
    } else {
      filePath = `${POSTS_DIR}/${BlogFront.slugifyFileName(title)}`;
    }

    $('saveBtn').disabled = true;
    try {
      await BlogApi.saveFile(currentToken, filePath, content,
        (currentFile ? 'Update ' : 'Add ') + filePath.split('/').pop(), sha);
      toast('已保存并提交，即将自动构建发布');
      currentFile = { name: filePath.split('/').pop(), path: filePath, sha: sha };
      showMain();
      loadPosts();
    } catch (err) {
      toast('保存失败：' + err.message);
    } finally {
      $('saveBtn').disabled = false;
    }
  }

  async function deletePost() {
    if (!currentFile) return;
    if (!confirm('确定删除该文章？删除后无法恢复。')) return;
    $('deleteBtn').disabled = true;
    try {
      await BlogApi.api(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${currentFile.path}`, currentToken, {
        method: 'DELETE',
        body: JSON.stringify({
          message: 'Delete ' + currentFile.name,
          sha: currentFile.sha,
          branch: REPO_BRANCH,
        }),
      });
      toast('已删除');
      showMain();
      loadPosts();
    } catch (err) {
      toast('删除失败：' + err.message);
    } finally {
      $('deleteBtn').disabled = false;
    }
  }

  // ---- 文件上传图片 ----
  function handleUpload(files) {
    Array.from(files).forEach(async (file) => {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const path = `${IMAGES_DIR}/${dateStr}-${safeName}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        await BlogApi.uploadFile(currentToken, path, bytes, 'Upload ' + safeName);
        const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${path}`;
        try {
          await navigator.clipboard.writeText(url);
          toast('图片已上传，URL 已复制到剪贴板');
        } catch (e) {
          toast('图片已上传：' + url);
        }
      } catch (err) {
        toast('上传失败：' + err.message);
      }
    });
    $('fileInput').value = '';
  }

  // ---- 事件绑定 ----
  window.addEventListener('DOMContentLoaded', () => {
    $('loginBtn').addEventListener('click', () => BlogAuth.login());
    $('logoutBtn').addEventListener('click', () => BlogAuth.logout());
    $('newPostBtn').addEventListener('click', newPost);
    $('backBtn').addEventListener('click', () => { showMain(); loadPosts(); });
    $('saveBtn').addEventListener('click', savePost);
    $('deleteBtn').addEventListener('click', deletePost);
    $('tabWrite').addEventListener('click', () => toggleTab(true));
    $('tabPreview').addEventListener('click', () => { toggleTab(false); updatePreview(); });
    $('bodyEditor').addEventListener('input', updatePreview);
    $('fileInput').addEventListener('change', (e) => handleUpload(e.target.files));

    // 初始化路由
    if (currentToken === null) currentToken = BlogAuth.getToken();

    if (window.location.search.includes('code=')) {
      handleCallback();
      return;
    }

    if (currentToken) {
      afterLogin(currentToken);
    } else {
      showLogin();
    }
  });
})();

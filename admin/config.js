// ===== OAuth 配置 =====
// Client ID 是公开信息，可安全写在此处（不可包含 client secret）。
const GITHUB_OAUTH_CLIENT_ID = 'Ov23li9fHWlCGEMcXKsb';

// Cloudflare Worker 代理地址（换 access_token 用，解决 CORS）。
const GITHUB_PROXY_URL = 'https://blog-admin-oauth-proxy.shengeyan.workers.dev';

// 目标仓库
const REPO_OWNER = 'shengeyan';
const REPO_NAME = 'blog-code';
const REPO_BRANCH = 'main';
const POSTS_DIR = 'source/_posts';
const IMAGES_DIR = 'source/images';

// GitHub API 相关
const GITHUB_API = 'https://api.github.com';

// ===== Front Matter 解析与 abbrlink 生成 =====
(function () {
  // 解析 markdown 文件的 front matter，返回 { meta: {title,date,abbrlink,tags,categories,...}, body }
  function parseFrontMatter(raw) {
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const out = { meta: {}, body: '' };
    if (!m) {
      out.body = raw;
      return out;
    }
    const fmText = m[1];
    const body = m[2] || '';
    const meta = {};
    const lines = fmText.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const keyMatch = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
      if (keyMatch) {
        const key = keyMatch[1];
        let value = keyMatch[2].trim();
        // 数组：- 开头的后续缩进行
        if (value === '') {
          const arr = [];
          let j = i + 1;
          while (j < lines.length && /^\s+-\s+/.test(lines[j])) {
            arr.push(lines[j].replace(/^\s+-\s+/, '').trim());
            j++;
          }
          if (arr.length > 0) {
            meta[key] = arr;
            i = j;
            continue;
          }
        }
        // 去引号
        value = value.replace(/^['"]|['"]$/g, '');
        meta[key] = value;
      }
      i++;
    }
    out.meta = meta;
    out.body = body;
    return out;
  }

  // 序列化 front matter + body 回 markdown
  function stringifyFrontMatter(meta, body) {
    const lines = ['---'];
    const keyOrder = ['title', 'date', 'abbrlink', 'categories', 'tags'];
    keyOrder.forEach((key) => {
      if (!(key in meta) || meta[key] === undefined || meta[key] === null) return;
      const v = meta[key];
      if (key === 'tags' || key === 'categories') {
        lines.push(`${key}:`);
        const arr = Array.isArray(v) ? v : (v ? [v] : []);
        arr.forEach((item) => { lines.push(`  - ${item}`); });
      } else {
        lines.push(`${key}: ${v}`);
      }
    });
    // 其他未知字段保持原样
    Object.keys(meta).forEach((key) => {
      if (keyOrder.includes(key)) return;
      const v = meta[key];
      if (Array.isArray(v)) {
        lines.push(`${key}:`);
        v.forEach((item) => { lines.push(`  - ${item}`); });
      } else if (v !== undefined && v !== null && v !== '') {
        lines.push(`${key}: ${v}`);
      }
    });
    lines.push('---');
    lines.push('');
    return lines.join('\n') + body;
  }

  // 生成 abbrlink：模拟 hexo-abbrlink 的 crc16/dec
  function generateAbbrlink(title) {
    const str = title || (Date.now().toString());
    const crc = crc16(str);
    return String(crc);
  }

  function crc16(str) {
    let crc = 0x0000;
    const bytes = new TextEncoder().encode(str);
    for (const b of bytes) {
      crc ^= b << 8;
      for (let i = 0; i < 8; i++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc = crc << 1;
        }
        crc &= 0xffff;
      }
    }
    return crc;
  }

  function formatDate(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // 文件名：标题（去除非法字符）+ .md
  function slugifyFileName(title) {
    const s = (title || 'untitled')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return s + '.md';
  }

  window.BlogFront = {
    parseFrontMatter,
    stringifyFrontMatter,
    generateAbbrlink,
    formatDate,
    slugifyFileName,
  };
})();

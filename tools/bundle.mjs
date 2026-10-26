/**
 * tools/bundle.mjs — 把 CSS / JS 全部内联，产出单文件 dist/index.html
 *
 * 用途：GitHub 网页上传最省事的方式 —— 只拖一个 index.html 进去就能跑，
 *       不用管 css/、js/ 目录结构，也不会有"上传漏了文件"的问题。
 *
 * 用法：node tools/bundle.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist');

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* 内联样式表 */
html = html.replace(/[ \t]*<link[^>]*href="(css\/[^"?]+)[^"]*"[^>]*>\s*/g, (m, href) => {
  const css = fs.readFileSync(path.join(ROOT, href), 'utf8');
  console.log('inline', href, (css.length / 1024).toFixed(1) + 'KB');
  return '<style>\n' + css + '\n</style>\n';
});

/* 内联脚本（按原顺序） */
html = html.replace(/[ \t]*<script[^>]*src="(js\/[^"?]+)[^"]*"[^>]*><\/script>\s*/g, (m, src) => {
  let js = fs.readFileSync(path.join(ROOT, src), 'utf8');
  /* 防止脚本里出现 </script 提前闭合 */
  js = js.replace(/<\/script/gi, '<\\/script');
  console.log('inline', src, (js.length / 1024).toFixed(1) + 'KB');
  return '<script>\n' + js + '\n</script>\n';
});

/* 加个构建标记，方便确认线上跑的是哪一版 */
html = html.replace('</head>', '<!-- bundled: single file, no external css/js -->\n</head>');

fs.mkdirSync(DIST, { recursive: true });
const out = path.join(DIST, 'index.html');
fs.writeFileSync(out, html, 'utf8');

const size = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`\n生成 ${out}  (${size}KB)`);
console.log('把这个文件上传到 GitHub 仓库根目录，文件名保持 index.html 即可。');

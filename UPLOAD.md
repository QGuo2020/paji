# 上传到 GitHub Pages（网页操作，跟你 sad-notes 那套一样）

目标地址：`https://qguo2020.github.io/paji/`（仓库名叫什么，路径就是什么）

一共有两种上传方式，**推荐方式 A**：只传一个文件，不会漏文件、不用管目录。

---

## 方式 A（推荐）：只传 `dist/index.html` 一个文件

`dist/index.html` 是把 CSS + JS 全部内联进去的单文件版（51KB），上传后就是完整成品。

1. 生成/更新单文件（改了源码之后跑一次）：

   ```powershell
   node tools/bundle.mjs
   ```

2. GitHub 上新建仓库：名字 **`paji`**，可见性 **Public**（免费 Pages 要求公开），勾选 Add a README 也行。

3. 进入仓库 → **Add file → Upload files** → 把 `D:\02_Git\个人项目\paint-smash\dist\index.html` 拖进去 → 下方 **Commit changes**。

   ⚠️ 文件名必须是 `index.html`，且放在**仓库根目录**（不要放子目录），否则打开会是 404 或目录列表。

4. 仓库 → **Settings → Pages** → Source：`Deploy from a branch` → Branch：`main` + `/ (root)` → **Save**。

5. 等 1~3 分钟（首次发布最慢），打开 **https://qguo2020.github.io/paji/**

6. 以后改完：重新上传同名 `index.html` 覆盖 → Commit → 等 1~2 分钟 → **Ctrl + F5** 强刷。

---

## 方式 B：上传整个目录（保留 css/、js/ 结构）

想保留可读的源码结构就用这个。源码版和单文件版功能完全一样。

1. 在仓库页面 → **Add file → Upload files**，把下面这些**一起**拖进去（GitHub 网页支持拖文件夹，层级会保留）：

   ```
   index.html
   css/          （里面 style.css）
   js/           （guard.js audio.js blob.js effects.js main.js）
   .nojekyll     （可选，见下）
   ```

2. 传完检查仓库根目录下确实有 `index.html`、`css/style.css`、`js/main.js` 这三个路径，层级错一层就会白屏。

3. 后面的 Settings → Pages 步骤和方式 A 完全一样。

> `.nojekyll`：GitHub Pages 默认用 Jekyll 处理，遇到下划线开头的文件会跳过。本项目不依赖它，但留着更保险。网页上传时隐藏文件不太好选，可以用 **Add file → Create new file**，文件名填 `.nojekyll`，内容留空，提交即可。

---

## 常见坑（基本都是这几条）

| 现象 | 原因 / 处理 |
|---|---|
| 打开是 404 或一堆文件列表 | 仓库根目录没有 `index.html`，或者放进了子目录 |
| 页面空白、控制台 404 `style.css` | 方式 B 的目录层级错了（应为 `css/style.css`，不是 `style.css`） |
| 改了没生效 | 浏览器缓存：**Ctrl + F5**；或开无痕窗口验证；Pages 本身也有 1~2 分钟延迟 |
| Pages 设置里 Branch 是空的 | 仓库还没有任何提交，先上传一次文件 |
| 发布按钮点了没反应 | 免费版 Pages 需要 **Public 仓库** |

## 关于域名

- 先用 `qguo2020.github.io/paji/` 就行，**0 元、不用备案**；
- 想换短域名：Settings → Pages → Custom domain 填 `paji.top`，再去域名商加一条
  `CNAME  paji.top → qguo2020.github.io`，勾上 Enforce HTTPS，几分钟自动签发证书。
- GitHub 的服务器在海外，所以自定义域名不需要 ICP 备案；国内访问 100~400ms。

## 手机/平板

页面是全屏自适应的，iOS Safari / Android Chrome 都能直接跑（多指同时画也支持）。
想要「像 App 一样」可以再加 `manifest.webmanifest` + 添加到主屏幕，需要的话说一声。

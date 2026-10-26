# 一键推到 GitHub（Windows）

第一次用：

```powershell
cd D:\02_Git\个人项目\paint-smash
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

以后每次改完：

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\push.ps1 "改了什么"
```

推完之后 GitHub Pages 一般 30~60 秒自动更新（有时候要 2 分钟）。

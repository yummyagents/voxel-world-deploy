# 像素方块世界 · GitHub Pages 部署说明

纯静态网页游戏（HTML + ES Module + Three.js）。Three.js 已打包在本地 js/lib/，
不依赖任何外部 CDN，国内可直接打开，无需后端、无需构建。

## 上传哪些文件
把本文件夹里的【全部内容】上传到仓库根目录：
- index.html
- js/（整个文件夹，里面含 js/lib/three.module.js 引擎）
- styles/
- .nojekyll（隐藏文件，若没有可在 GitHub 用 Create new file 建一个，文件名填 .nojekyll，内容留空）

## 部署步骤
1. GitHub 新建 Public 仓库 → Add file → Upload files → 拖入全部内容 → Commit。
2. Settings → Pages → Source 选 Deploy from a branch → Branch 选 main / root → Save。
3. 等 1–2 分钟，访问 https://你的用户名.github.io/仓库名/

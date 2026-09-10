# 像素方块世界 · GitHub Pages 部署说明

纯静态网页游戏（HTML + ES Module + Three.js）。**Three.js 已打包在本地 js/lib/ 目录，
不依赖任何外部 CDN，国内可直接打开，无需后端、无需构建。**

## 目录结构
```
index.html              # 入口
styles/main.css         # 样式
js/                     # 游戏逻辑（含 js/lib/three.module.js 本地渲染引擎）
.nojekyll               # 必须：让 GitHub Pages 跳过 Jekyll（隐藏文件，务必上传）
```

## 部署（网页上传，最简单）
1. GitHub 右上角 New repository，名字如 voxel-world，选 Public，创建。
2. Add file → Upload files，把本文件夹**所有内容**拖入（index.html、js、styles、.nojekyll）。
   .nojekyll 是隐藏文件；若没传上，可 Add file → Create new file，文件名填 .nojekyll，内容留空提交。
3. Commit changes。
4. Settings → Pages → Source 选 Deploy from a branch → Branch 选 main / root → Save。
5. 等 1–2 分钟，得到地址 https://你的用户名.github.io/仓库名/

## 常见问题
- 白屏/黑屏：检查 .nojekyll 是否上传、index.html 是否在仓库根目录、js 文件夹是否完整。
- 打开后样式丢失：确认 styles 文件夹已上传。
- 手机：直接用手机浏览器打开地址即可，已做触屏适配。

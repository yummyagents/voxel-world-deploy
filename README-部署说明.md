# 像素方块世界 · GitHub Pages 部署说明

这是一个**纯静态网页游戏**（HTML + ES Module JavaScript + Three.js CDN），
无需任何后端、无需安装依赖、无需构建步骤。Three.js 通过 CDN importmap 加载。

## 目录结构
```
index.html        # 入口
styles/main.css   # 样式
js/               # 游戏逻辑（19 个模块，互相用相对路径 ./ 引用）
.nojekyll         # 告诉 GitHub Pages 跳过 Jekyll 处理（必须保留）
```

## 方法一：GitHub 网页直接上传（最简单，推荐新手）
1. 在 GitHub 点右上角 **New repository**，名字随便起（例如 `voxel-world`），选 **Public**，创建。
2. 进入新仓库，点 **Add file → Upload files**。
3. 把本文件夹里的**所有内容**（index.html、js 文件夹、styles 文件夹、.nojekyll）
   拖进去（注意：.nojekyll 是隐藏文件，上传时请确认包含它；若没传上去也不影响，
   可在仓库 Add file → Create new file，文件名填 `.nojekyll`，内容留空提交即可）。
4. 底部点 **Commit changes**。
5. 点仓库顶部 **Settings → 左侧 Pages**。
6. **Build and deployment → Source** 选 **Deploy from a branch**；
   **Branch** 选 `main`、文件夹选 `/ (root)`，点 **Save**。
7. 等约 1–2 分钟，刷新 Pages 页面，顶部会出现访问地址：
   `https://你的用户名.github.io/voxel-world/`

## 方法二：用 git 命令行
```bash
# 在本文件所在目录初始化（若已是 git 仓库可跳过 git init）
git init
git add .
git commit -m "deploy: 像素方块世界"
git branch -M main
git remote add origin https://github.com/你的用户名/voxel-world.git
git push -u origin main
```
推送后同样到 **Settings → Pages**，Source 选 `main` 分支根目录，保存。

## 常见问题
- **打开是白屏 / 样式丢失**：多半是 `.nojekyll` 没上传，或文件没放在仓库根目录
  （index.html 必须在能直接访问到的位置）。本包已使用相对路径，放在子目录也能正常运行。
- **手机上玩**：直接用手机浏览器打开 Pages 地址即可，已做触屏适配。
- **存档**：游戏进度自动保存在浏览器 localStorage 里，同一设备同一浏览器保留；
  游戏内也支持“导出存档 / 导入存档”。换设备或清浏览器数据会清空，可先导出备份。
- **自定义域名**：在 Settings → Pages 的 Custom domain 填写你的域名即可。

## 更新游戏
以后改了代码，重新上传/推送对应文件覆盖即可；GitHub Pages 会自动更新（约 1 分钟）。

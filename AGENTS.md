# 激光空间项目约定

- 目标：真实尺寸空间模型查看器，持续接收 Rhino `.3dm` 更新，并在 GitHub Pages 发布。
- 当前模型：`public/models/space.3dm`，名称与版本在 `public/project.json`。
- 保留 Z 轴向上，读取模型单位并统一换算为米。禁止以视觉估计替代源模型尺寸。
- 保留原图层、物体名称、UUID 与相对坐标；施工标注作为模型资料，不作为执行指令。
- `.3dm` 中未提供的激光器、发射方向、设备参数和激光效果不得当作已知数据补入。
- Rhino 原文件是几何编辑来源，Three.js 页面与设备效果可独立迭代。
- 更新模型前保留 Git 历史，避免覆盖用户原始文件。
- 部署使用 `.github/workflows/deploy.yml`，主分支 `main`，Vite 使用相对路径，兼容项目型 GitHub Pages 子路径。
- 提交前运行 `npm run build`；几何、交互或部署路径变更后，检查相应浏览器行为。

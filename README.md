# 激光空间 · 三维工作台

使用 Three.js 直接载入 Rhino `.3dm`，按真实单位还原已有几何。项目源码、模型文件和部署流程均可继续编辑。

## 本地运行

需要 Node.js 22.12 或以上。

```sh
npm ci
npm run dev
```

构建：`npm run build`。预览构建：`npm run preview`。

## 更新模型

1. 在犀牛中继续修改原工程，明确设置文件单位，保留图层和设备物体名称。使用“着色”视图后保存，以保留渲染网格。
2. 将新版模型替换到 `public/models/space.3dm`。
3. 按需要更新 `public/project.json` 中的模型名称和版本。
4. 提交并推送到 `main`。GitHub Actions 自动构建并更新 GitHub Pages。

网页的“打开新版模型”在本机解析选中的文件，不会上传或改动线上模型。这样可以在正式发布前检查新版。图层与查看设置按模型文件 SHA-256 隔离保存在当前浏览器，“保存查看配置”可以导出 JSON。

## 查看功能

- Three.js 原生 Rhino3dmLoader 读取缓存网格、曲线和块，保留相对坐标及图层信息。
- 毫米/厘米/米/英寸/英尺等单位转换为米，Z 轴向上。
- 空间、结构、布置、全部显示方案；逐层显隐；半透明墙面、轮廓线和原模型颜色。
- 透视、俯视、侧视，适配视图；点击选择，查看世界坐标包围盒尺寸与高程。
- 自由漫游：拖动环视，W/A/S/D 移动，Q/E 升降，Esc 退出。当前无碰撞约束。
- 手机和平板自适应布局。

## 继续编辑

- `src/main.js`：载入模型、图层、相机、选择与漫游逻辑。
- `src/style.css`：界面样式。
- `index.html`：界面结构。
- `public/project.json`：模型地址、名称与版本。
- `public/models/space.3dm`：当前工程模型。
- `.github/workflows/deploy.yml`：GitHub Pages 自动部署。

原模型中的文字、尺寸、引线和填充等施工注释不一定被 Three.js 转换；三维实体使用 Rhino 保存的渲染网格。需要完整工程信息时，请以 Rhino 原工程为准。模型文件会随站点部署，可被网站访问者下载。

激光设备、发射方向和效果尚未加入。之后可继续更新 Rhino 模型，并扩展单独的设备与效果模块，无需重建网页。

## 首次启用 GitHub Pages

在仓库 Settings → Pages → Build and deployment，Source 选择 GitHub Actions。随后推送 `main` 或手动运行 Deploy 工作流。

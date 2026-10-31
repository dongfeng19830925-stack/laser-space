# 激光空间 · 三维工作台

使用 Three.js 直接载入 Rhino `.3dm`，按真实单位还原已有几何。项目源码、模型文件和部署流程均可继续编辑。

在线查看：https://dongfeng19830925-stack.github.io/laser-space/

源码仓库：https://github.com/dongfeng19830925-stack/laser-space

## 本地启动流程

需要 Node.js 22.12 或以上（含 npm）。在终端执行：

```sh
git clone https://github.com/dongfeng19830925-stack/laser-space.git
cd laser-space
npm ci
npm run dev
```

启动后保持终端运行，浏览器打开终端显示的地址（默认 `http://127.0.0.1:5173/`）：

- Rhino 模型查看器：`http://127.0.0.1:5173/`
- 激光房间模拟：`http://127.0.0.1:5173/laser-room/`

如果端口被占用，以终端实际显示的端口为准。按 `Ctrl+C` 停止服务。不要直接双击 HTML 文件启动。

生产构建和本地预览：

```sh
npm run build
npm run preview
```

预览默认地址为 `http://127.0.0.1:4173/`；模拟入口为 `/laser-room/`。构建输出在 `dist/`，两个页面会一同构建。

## 激光房间模拟（独立入口）

源码位于 `laser-room/`，与 Rhino 模型查看器分开；模拟尺寸来自设计讨论，不表示 Rhino 模型已经包含这些设备或尺寸。

- 12个框，每框2.8m × 2.8m；框距90cm，首尾框跨度9.9m，不含框体厚度。
- 每框顶部发射、底部接收各6点；站在入口向内看，左侧发射、右侧接收各6点；点间距40cm，四周留边40cm。
- 左右封板；总览可剖开侧墙，摄像头画面保留实体墙遮挡。
- 原3台顶拍和试验6台相向斜拍可切换；16:9，水平视场角默认90°，侧栏同步显示全部CAM。
- 4名身高180cm的模拟行人，各自随机变速、横移、停顿和循环，提供暂停、重新开始、P1位置拖动和9.41m定位。
- 默认仅显示高亮接收点，隐藏激光线；人体挡住光路时对应接收点熄灭，挡住摄像头视线时保留实体遮挡。关闭“仅接收点”可恢复普通视图，按需显示光束。
- 人体模型与光束几何相交时，标注人员、列号与光束编号；普通视图中可显示红色碰线光束。

操作：拖动旋转、滚轮缩放、右键或双指平移；底部切换总览、正视、房间内部与俯视；点击CAM标题放大。

**当前限制：** 未连接真实摄像头、激光或感光硬件。碰线提示来自模拟模型几何计算，不是视频识别。滤光视图仅为视觉近似，未标定真实波长、曝光、散射亮度；接收点熄灭由模型几何计算驱动，尚未实现基于摄像头图像的“断光”和“摄像头视线被遮挡”分类；机位方案是待现场验证的试验布局。行人使用简化人形与避让逻辑，不是人体测量或完整人群物理仿真。

关键文件：`laser-room/index.html`、`laser-room/src/main.js`、`laser-room/src/style.css`。Three.js通过项目npm依赖打包，无需复制 `node_modules` 或第三方库源码。

GitHub Pages部署成功后，模拟入口为：
https://dongfeng19830925-stack.github.io/laser-space/laser-room/

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

Rhino 模型查看器尚未加入激光设备效果。独立的 `laser-room/` 页面提供参数化模拟，两者暂未做几何绑定。之后可继续更新 Rhino 模型。

## 首次启用 GitHub Pages

在仓库 Settings → Pages → Build and deployment，Source 选择 GitHub Actions。随后推送 `main` 或手动运行 Deploy 工作流。

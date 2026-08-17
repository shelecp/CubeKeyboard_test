# 魔方键盘（Cube Keyboard）

一个基于 Web 的 3D 魔方展示与“扭动 → 字符输出”可编程原型。当前版本为 **M3**：在 M2 规则引擎和虚拟输入法基础上，加入方向模拟、动态层映射、完整相机交互和扭转速度调节。

最终目标是做一个现实中的“魔方键盘”硬件，但当前仓库只负责软件原型、规则引擎、页面内虚拟输入法和方向模拟。**本项目不读取真实硬件方向，不接系统级输入法。**

## 环境要求

- 任意现代浏览器，需要支持 WebGL
- 开发时需要 Node.js 18+ 与 npm

当前只使用 Three.js + WebGL 渲染。Canvas 2D 兜底已列为后续预留，不在当前版本实现。

## 快速开始

开发模式（热更新）：

```bash
npm install
npm run dev
```

构建为单个静态文件：

```bash
npm run build
```

构建产物在 `dist/index.html`，Three.js 已全部内联，无需联网。

预览构建产物：

```bash
npm run preview
```

## 默认键盘映射

键位按六面体展开图布局：

```text
            E（顶面 U）
        J（竖中层 M）
A（左面 L） S（正面 F） D（右面 R） F（背面 B）
        K（横中层 E）
            C（底面 D）
  另外：L 键 = 前后中层 S
```

- 直接按键 = 顺时针扭转该面
- `Shift + 按键` = 逆时针扭转该面
- 键位、参考系颜色都可以在配置中修改

鼠标左键 / 单指旋转视角，鼠标右键 / 双指平移，滚轮 / 捏合缩放；旋转中心固定在魔方中心。

## 渲染方式

- 浏览器支持 WebGL 时：使用 Three.js 的完整 3D 渲染。
- 页面左侧“运行自检”会显示当前 WebGL 状态和渲染诊断。
- Canvas 2D 软件渲染当前不实现，只作为后续预留项。

## 规则与虚拟输入法

- **输入模式**：界面顶部可在“扭转序列”与“九宫格”两种模式之间切换。
- **扭转序列规则**：例如“先转右面 R，再转背面 B”对应输出 `a`。默认演示规则为 `R B → a`。
  - 默认还内置模拟功能规则：`M → ⌫`（模拟删除）、`E → ␣`（模拟空格）、`S → ⇥`（模拟补全），分别对应键盘 `J / K / L`。
  - 序列采用“缓冲 + 最长后缀匹配”：每次输入后立即检查当前缓冲，命中规则就立即输出，无需手动提交或等待。
  - 输入 `D` 键（右面 R）、`F` 键（背面 B）后，即可立即在虚拟输入法看到 `a`。
- **九宫格模式**：选择某个逻辑面，点击 3×3 格子即可输出对应字符。支持 QWERTY / 字母顺序 / 数字 1-9 预设，也可单独编辑某格。
  - 该模式当前功能定位仍不明确，后续需要进一步改进。
- **虚拟输入法**：页面内简单虚拟输入法，不是系统输入法。
  - 英文模式：直接输出。
  - 中文模式：纯英文字母 / 数字视为拼音并显示候选，中文 / 符号直接上屏。
  - 当前拼音候选表是轻量演示版本，后续可再扩展。

## 默认参考系与配色

- 正面（F）= 白色
- 顶面（U）= 红色
- 背面（B）= 黄色
- 底面（D）= 橙色
- 右面（R）= 蓝色
- 左面（L）= 绿色

界面左侧“参考系”支持两种模式：

- **手动**：直接选择正面 / 顶面颜色；魔方中层转动后，正面 / 顶面继续跟随所选颜色。
- **方向模拟**：不读取真实设备方向，而是用固定 XYZ 和当前 3D 相机视角判断魔方哪个面朝上、哪个面朝向用户。

方向模拟的默认定义是：顶面 = 屏幕上方方向对应的面，正面 = 朝向用户方向对应的面。

## 配置

默认配置唯一来源是 [src/mapping/defaultConfig.js](src/mapping/defaultConfig.js)，结构如下：

```js
export const DEFAULT_CONFIG = {
  version: 1,
  reference: { front: 'white', up: 'red' },
  turnDurationMs: 180,
  keymap: {
    e: { face: 'U' },
    a: { face: 'L' },
    s: { face: 'F' },
    d: { face: 'R' },
    f: { face: 'B' },
    c: { face: 'D' },
    j: { face: 'M' },
    k: { face: 'E' },
    l: { face: 'S' },
  },
  rules: [
    {
      id: 'demo-a',
      type: 'turn-sequence',
      when: ['R', 'B'],
      output: 'a',
    },
    {
      id: 'default-delete',
      type: 'turn-sequence',
      when: ['M'],
      output: '⌫',
    },
    {
      id: 'default-space',
      type: 'turn-sequence',
      when: ['E'],
      output: '␣',
    },
    {
      id: 'default-complete',
      type: 'turn-sequence',
      when: ['S'],
      output: '⇥',
    },
  ],
  stickerMaps: [],
};
```

界面支持“导出配置”和“导入配置”。所有配置变更都会自动保存到浏览器 `localStorage`，并提供“重置所有配置”按钮恢复默认值。

## 对外接口（供大模型 / 开发者调用）

页面加载后，在浏览器控制台可直接使用 `window.CubeKeyboard`：

```js
// 操作魔方
await CubeKeyboard.applyMove("F");
await CubeKeyboard.applyMove("R'");
await CubeKeyboard.applyMove("U2");
await CubeKeyboard.turnRelative("F");
CubeKeyboard.resolveRelativeTurn("F", 1);
CubeKeyboard.getResolvedKeymap();
CubeKeyboard.resetCube();

// 配置读写
CubeKeyboard.loadConfig(json);
const cfg = CubeKeyboard.exportConfig();
CubeKeyboard.saveConfig();
CubeKeyboard.resetConfig();
CubeKeyboard.setTurnDuration(180);

// 规则管理
CubeKeyboard.registerRule({
  id: "a",
  type: "turn-sequence",
  when: ["R", "B"],
  output: "a",
});
CubeKeyboard.removeRule("a");
CubeKeyboard.listRules();

// 贴纸 / 九宫格映射
CubeKeyboard.registerStickerMap({
  id: "front-9",
  face: "F",
  cells: { "0,0": "a" },
});
CubeKeyboard.removeStickerMap("front-9");
CubeKeyboard.listStickerMaps();
CubeKeyboard.triggerSticker("F", { row: 0, col: 0 });
CubeKeyboard.setStickerCell("F", 1, 2, "X");
CubeKeyboard.clearStickerCell("F", 1, 2);

// 参考系与朝向
CubeKeyboard.setReference({ front: "white", up: "red" });
CubeKeyboard.setPoseDetectorMode("manual");
CubeKeyboard.setPoseDetectorMode("simulate");
CubeKeyboard.getPoseReference();
CubeKeyboard.getPoseDetection();
CubeKeyboard.resetView();
CubeKeyboard.setOrientationForTesting({ x: 0, y: 0, z: 0, w: 1 });

// 事件订阅
CubeKeyboard.on("output", (output) => console.log(output));
CubeKeyboard.on("statechange", (state) => console.log(state));
CubeKeyboard.on("turnschange", (buffer) => console.log(buffer));
CubeKeyboard.on("configchange", (config) => console.log(config));
CubeKeyboard.on("referencechange", (reference) => console.log(reference));
```

扭转记法：`F / B / U / D / L / R` 为六个面，`M / E / S` 为三个中层；顺时针直接写，加 `'` 为逆时针，加 `2` 为 180°。

## 目录结构

```text
src/
├─ main.js                         # 入口
├─ cube/
│  ├─ CubeModel.js                 # 魔方逻辑状态与扭转
│  ├─ CubeRenderer.js              # Three.js 渲染、相机交互与动画
│  ├─ CameraRig.js                 # 相机轨道与平移数学
│  ├─ colors.js                    # 配色与面颜色推导
│  ├─ orientationDetection.js      # 方向判定数学，仅用于方向模拟
│  ├─ orientationMap.js            # 用户视角逻辑面到世界面映射
│  └─ pose.js                      # 手动 / 方向模拟参考系
├─ mapping/
│  ├─ ruleEngine.js                # 扭转序列与贴纸规则引擎
│  ├─ config.js                    # 配置读取 / 保存 / 迁移 / 导出
│  ├─ defaultConfig.js             # 运行时默认配置唯一来源
│  ├─ notation.js                  # 扭转记法规范化
│  └─ api.js                       # window.CubeKeyboard 接口
├─ ime/
│  ├─ ImePanel.js                  # 页面内虚拟输入法
│  └─ candidates.js                # 轻量拼音候选表
├─ ui/
│  ├─ panels.js                    # 侧栏交互
│  └─ styles.css                   # 中文界面样式
└─ utils/emitter.js                # 事件发射器

scripts/
├─ test-model.mjs
├─ test-rules.mjs
├─ test-gyro.mjs
├─ test-camera.mjs
├─ test-orientation.mjs
└─ test-ime.mjs
```

## 测试

```bash
npm test
```

该测试覆盖魔方扭转数学、规则引擎、方向判定、相机轨道、键盘层映射和输入法解释逻辑，不依赖浏览器渲染。

## 已知限制与后续计划

- 当前不读取真实硬件方向 / 陀螺仪；方向模拟只是软件模拟。
- 当前不是系统级输入法，只是页面内简单虚拟输入法。
- 当前规则引擎只支持 `turn-sequence`，`state` 状态匹配规则保持未实现，暂不处理。
- 中文候选目前使用内置轻量拼音表，后续可替换为更完整词库。
- Canvas 2D 软件渲染兜底作为后续预留项，当前不实现。
- 九宫格模式功能定位仍不明确，需要后续改进。

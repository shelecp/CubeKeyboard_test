# 魔方键盘（Cube Keyboard）

一个基于 Web 的 3D 魔方展示与“扭动 → 字符输出”可编程原型。当前版本为 **v0.4**：输入法体系全面重构——五套输入法（26键拼音 / 双拼 / 五笔预留 / 纯英文 / 九宫格拼音）各自拥有独立配置与扭转规则表，新增模拟触摸（悬停焦点 / 点击取字）、贴纸唯一编号与编辑模式、九宫格独立模块、抽屉把手式侧边栏与悬浮输入法栏。

> 键位与配置变更史见 [docs/计划书.md](docs/计划书.md)（v0.4）。旧版计划书已归档为 `docs/计划书-2026-08-16.zip`（已失效，不需要查看）。

最终目标是做一个现实中的“魔方键盘”硬件，但当前仓库只负责软件原型、规则引擎、页面内虚拟输入法和方向模拟。**本项目不读取真实硬件方向，不接系统级输入法。**

## 环境要求

- 任意现代浏览器，需要支持 WebGL
- 开发时需要 Node.js 18+ 与 npm

当前只使用 Three.js + WebGL 渲染。Canvas 2D 兜底已列为后续预留，不在当前版本实现。

## 快速开始

### 开发运行（改代码时用）

```bash
npm install          # 首次安装依赖（需要 Node.js 18+）
npm run dev          # 启动开发服务器
```

启动后终端会打印本地地址，用浏览器打开即可（默认 **http://localhost:5173** ，若被占用会提示新端口）。改代码会热更新。

### 构建产物

```bash
npm run build        # 生成单文件 dist/index.html
```

产物是**一个自包含的 `dist/index.html`**：Three.js、样式、九键字库全部内联，无任何外部依赖、无需联网。

### 部署 / 分发（怎么用构建产物）

任选其一：

- **直接双击打开**：把 `dist/index.html` 拷到任意机器，双击用 Chrome/Edge 打开即可运行（纯前端，无需服务器、无需联网）。
- **本地预览**：`npm run preview`（默认 http://localhost:4173 ）。
- **静态托管**：把 `dist/` 目录整体上传到任意静态站点即可，例如 GitHub Pages、Cloudflare Pages、Vercel（以 `dist` 为输出目录）、Nginx / 对象存储 / 本地 `npx serve dist`。因为只有一个 HTML 文件，不需要任何后端或路由配置。

> 注意：应用用到 WebGL，需在支持硬件加速的浏览器中打开；`file://` 直接双击即可，个别浏览器若限制本地文件加载可改用 `npm run preview` 或任意静态服务器。

### 测试

```bash
npm test             # Node 逻辑测试（不依赖浏览器）
npm run test:e2e     # Playwright 浏览器端到端测试（首次运行会自动下载浏览器）
```

## 键盘映射（唯一权威来源：src/mapping/defaultConfig.js）

六面键位**固定**为 a / s / d / f / r / v：

```text
        R（顶面 U）
  A（左 L） S（正 F） D（右 R） F（背 B）
        V（底面 D）
```

另有 j / k / l 三个中层键：J = 竖中层 M，K = 横中层 E，L = 前后中层 S。

- 直接按键 = 顺时针扭转该层
- `Shift + 按键` = 逆时针扭转该层

> 历史教训：v2 曾有“旧键位静默迁移”代码把 r/v 改写成 e/c，导致键位漂移。v3 起已彻底删除迁移逻辑，键位只认 `defaultConfig.js`；修改键位请同步更新 README 与页面提示文案，**不要写任何迁移代码**。

鼠标左键 / 单指旋转视角，鼠标右键 / 双指平移，滚轮 / 捏合缩放；旋转中心固定在魔方中心。

## 界面布局

- **侧边栏（一体导轨式）**：开关把手是侧边栏右侧一条 36px 导轨的一部分，与面板同属一个动画容器、共用同一个 transform；把手不遮挡面板滚动条。收起后侧边栏滑出屏幕、导轨恰好留在屏幕左缘，随时可再展开。
- **悬浮输入法栏**：所有输入法共用，按住标题栏可任意拖动，拖拽四边 / 四角可像窗口一样缩放；含状态、组词预览、分页候选（鼠标点选 / 数字键 1-9 / ‹ › 翻页）、输出区、退格 / 清空。
- **九宫格模式按钮（页面右上角）**：独立实验功能，见下文。
- 侧栏面板：运行自检 → 输入法（下拉切换）→ 扭转规则（含录制）→ 格子与文字（编辑模式）→ 参考系 → 键盘映射 → 操作记录 → 动作。

## 输入法体系（v0.4 重构核心）

每个输入法一个 JSON 配置，位于 [src/configs/ime/](src/configs/ime/)，包含名称、引擎类型、**专属默认扭转规则表**等。切换输入法即切换它的规则表；增删的规则按输入法分表持久化，互不干扰。

| 输入法 | 状态 | 打字方式 |
| --- | --- | --- |
| 26键拼音 | 完整实现 | 两段扭转出字母，字母累积成拼音，候选点选 |
| 九键拼音 | 完整实现 | 扭一层输出一个按键字母组（abc/def…），组→数字→九键拼音候选 |
| 双拼（小鹤） | 简版实现 | 两键定一个音节（如 h+c = hao），复用拼音候选 |
| 五笔 | 预留 | 规则表生效，字母只记录展示，字库接口已留 |
| 纯英文 | 完整实现 | 字母直接上屏 |

> 九键拼音是与其他输入法**平级**的正式输入法；**九宫格模式**是另一回事——它是页面右上角的独立实验开关，见下文。两者都用到九键拼音引擎（`src/ime/t9Engine.js`），但互不绑定。

### 九键拼音的规则表（输出锁定）

九键的每条规则输出一个按键的字母组：`abc / def / ghi / jkl / mno / pqrs / tuv / wxyz / 标点`。这些**输出文字由九键布局决定、不可修改**，只能改每条规则前面的扭转层（添加按钮隐藏、删除按钮隐藏、输出框禁用）。默认表里每个字母组用单层扭转（正反方向都映射到同一组）。

### 默认扭转规则表（26键 / 双拼 / 五笔 / 英文可自由改）

字母区统一为“**两段扭转 = 一个字母**”：第一段选行（U/E/D），第二段选列（L/M/R/F/B），第二段带 `'` 为逆时针：

```text
a=U L   b=U L'  c=U M   d=U M'  e=U R   f=U R'  g=U F   h=U F'  i=U B   j=U B'
k=E L   l=E L'  m=E M   n=E M'  o=E R   p=E R'  q=E F   r=E F'  s=E B   t=E B'
u=D L   v=D L'  w=D M   x=D M'  y=D R   z=D R'
```

26 个字母恰好占满 3×5×2 个槽位；全部等长，因此“缓冲 + 最长后缀匹配”天然无前缀歧义，连打也不会误命中。
功能键独立占用前后中层 S：`S → ␣`（空格）、`S' → ⌫`（退格）、`S2 → ⇥`（上屏缓冲原文）。
对应键盘：U=R、D=V、L=A、M=J、R=D、F=S、B=F、S=L。记法图例（U/D/L/R/F/B/M/E/S 对应哪个面）也直接显示在"扭转规则"面板里。

### 规则录制

「扭转规则」面板的**录制**按钮：开启后直接按 a/s/d/f/r/v 扭层，序列实时填入（类似快捷键录制），再填输出字符保存。规则支持编辑（可重新录制）与删除。录制期间规则引擎暂停输出。

## 模拟触摸与编辑模式

- **贴纸唯一编号**：54 个贴纸按复原态阅读顺序编号（F1..F9、U1..U9……），编号绑定在小块上、随旋转永不改变。
- **模拟触摸**：鼠标悬停格子出现焦点高亮动画，移出魔方即消失；普通模式点击格子，输出该格写着的文字（进输入法组词）。
- **编辑模式**：侧栏「进入编辑模式」后，点击格子弹出可拖动编辑浮窗——顶部显示唯一编号、回车即保存、可同时开多个、点谁谁置顶；魔方仍可旋转，编号不会混淆。单格保存即时生效（暂存），**有未保存修改时页面右上角出现"保存"按钮**（侧栏内不再有"总保存"），点击统一写入 localStorage。
- 超长文字在贴纸上只显示前 4 字符 + `…`。

## 九宫格模式（独立实验，非输入法）

- 入口是**页面右上角的「九宫格模式」按钮**，与输入法下拉完全无关。
- 开启后：侧边栏自动收起并**锁定不可展开**、规则引擎暂停、贴纸文字隐藏、正面 9 格显示标准电话键盘（1标点、2abc…9wxyz）。
- 输入方式**只有旋转定位**：一次横向层（U/E/D 定行）+ 一次纵向层（L/M/R 定列），不分先后顺逆，交点即唯一格子，两次旋转输出一个数字键；同轴连转以最后一次为准；F/B 不参与。键位文字**实时跟随当前正面**。
- 再点一次按钮退出，恢复原输入法、贴纸文字与侧栏。
- 实现完全隔离在 `src/t9/`，通过 `import.meta.glob` 懒加载。**删除 `src/t9/` 后按钮自动隐藏，其余功能（含九键拼音输入法）零影响**——这是可随时交给智能体删掉的临时测试功能。
- 九宫格与九键拼音都用到 `src/ime/t9Engine.js` 引擎；删 `src/t9/` 不影响九键拼音输入法。

## 性能（v0.4.1 优化）

针对"运行一会儿就卡、拖慢整机"的问题，渲染层做了系统性优化：

- **按需渲染**：去掉常驻 `requestAnimationFrame` 循环，改为 `invalidate()` 事件驱动——空闲时**每帧 0 次 GPU 绘制**（实测空闲 3 秒 render=0），只有相机拖动 / 层扭转动画 / 悬停呼吸 / 贴纸变化时才出帧，避免持续占用 GPU 导致核显降频、整机发烫卡顿。
- **关闭 `preserveDrawingBuffer`**：不再每帧保留/拷贝帧缓冲，显著降低显存占用与合成开销。
- **设备像素比封顶 1.5**、**不强制独显**（去掉 high-performance，双显卡笔记本走核显更省电）。
- **消除每帧 GC**：视角检测复用临时向量；贴纸/高亮纹理关闭 mipmap（省约 1/3 显存）。
- 运行自检面板会显示"已启用 WebGL（Three.js · 按需渲染）"与像素比。

## 参考系与配色

- 正面（F）= 白色，顶面（U）= 红色，背面 = 黄色，底面 = 橙色，右面 = 蓝色，左面 = 绿色。
- **手动**：直接选择正面 / 顶面颜色；中层转动后跟随所选颜色。
- **方向模拟**：不读取真实设备方向，用当前 3D 相机视角判断哪面朝上、哪面朝向用户。九宫格模式会自动切到该模式，退出时恢复。

## 配置

默认配置唯一来源是 [src/mapping/defaultConfig.js](src/mapping/defaultConfig.js)。v3 配置结构：

```js
export const DEFAULT_CONFIG = {
  version: 3,
  reference: { front: 'white', up: 'red' },
  turnDurationMs: 180,
  keymap: {                     // 键位唯一权威来源
    r: { face: 'U' }, a: { face: 'L' }, s: { face: 'F' },
    d: { face: 'R' }, f: { face: 'B' }, v: { face: 'D' },
    j: { face: 'M' }, k: { face: 'E' }, l: { face: 'S' },
  },
  activeIme: 'pinyin26',        // 当前输入法（对应 src/configs/ime/*.json）
  imeRules: {},                 // 各输入法各自的扭转规则表（空缺时用 profile 默认表）
  cells: { F1: 'Q', F2: 'W', /* ... */ },  // 贴纸编号 → 文字
};
```

配置存于 localStorage `cube-keyboard-config-v3`。**v3 不做任何旧配置迁移**：旧版本存档直接作废。动作面板支持：重置魔方方向、重置当前 / 所有输入法的扭转规则、导出 / 导入**当前输入法**的扭转规则（导出文件带输入法标识，导入到不匹配的输入法会被页面提示拒绝）。

## 对外接口（供大模型 / 开发者调用）

页面加载后，在浏览器控制台可直接使用 `window.CubeKeyboard`：

```js
// 操作魔方
await CubeKeyboard.applyMove("F");
await CubeKeyboard.turnRelative("F");
CubeKeyboard.resolveRelativeTurn("F", 1);
CubeKeyboard.resetCube();

// 配置读写
CubeKeyboard.loadConfig(json);
CubeKeyboard.exportConfig();
CubeKeyboard.resetConfig();
CubeKeyboard.setTurnDuration(180);

// 输入法 profile
CubeKeyboard.activateProfile("shuangpin", defaultRules);
CubeKeyboard.getActiveProfile();
CubeKeyboard.setEngineSuspended(true);   // 暂停规则引擎（九宫格/录制/编辑模式用）
CubeKeyboard.isEngineSuspended();

// 规则管理（作用于当前输入法的规则表）
CubeKeyboard.registerRule({ id: "x", type: "turn-sequence", when: ["U", "L"], output: "a" });
CubeKeyboard.removeRule("x");
CubeKeyboard.listRules();
CubeKeyboard.resetImeRules("wubi", defaultRules);   // 重置某输入法（省略 id 则当前）的规则表
CubeKeyboard.exportImeRules();                       // { type, ime, rules } 带输入法标识
CubeKeyboard.importImeRules(payload, knownImeIds);   // 校验标识匹配，返回 { ok, message }

// 格子文字（贴纸唯一编号体系）
CubeKeyboard.setCellText("F5", "你好");
CubeKeyboard.getCellText("F5");
CubeKeyboard.listCells();
CubeKeyboard.listCellIds();
CubeKeyboard.saveCells();                // 编辑模式：右上角"保存"按钮统一持久化
CubeKeyboard.triggerCell("F1");          // 模拟触摸：输出该格文字
CubeKeyboard.applyCellsToRenderer();

// 参考系与朝向
CubeKeyboard.setReference({ front: "white", up: "red" });
CubeKeyboard.setPoseDetectorMode("simulate");
CubeKeyboard.getPoseDetection();
CubeKeyboard.resetView();

// 事件订阅
CubeKeyboard.on("output", (output) => console.log(output));
CubeKeyboard.on("turn", ({ face, dir, logical }) => console.log(face, dir));
CubeKeyboard.on("statechange", (state) => console.log(state));
CubeKeyboard.on("cellschange", (cells) => console.log(cells));
CubeKeyboard.on("cellssaved", (cells) => console.log(cells));
CubeKeyboard.on("configchange", (config) => console.log(config));
CubeKeyboard.on("referencechange", (reference) => console.log(reference));
```

扭转记法：`F / B / U / D / L / R` 为六个面，`M / E / S` 为三个中层；顺时针直接写，加 `'` 为逆时针，加 `2` 为 180°。

## 目录结构

```text
src/
├─ main.js                         # 入口
├─ cube/
│  ├─ CubeModel.js                 # 魔方状态 + 贴纸唯一编号（cellIds/cellOwner/stickerAt）
│  ├─ CubeRenderer.js              # Three.js 渲染 + 贴纸文字覆层 + raycast 拾取 + 焦点高亮
│  ├─ CameraRig.js                 # 相机轨道与平移数学
│  ├─ colors.js                    # 配色与面颜色推导
│  ├─ orientationDetection.js      # 方向判定数学（仅用于方向模拟）
│  ├─ orientationMap.js            # 用户视角逻辑面到世界面映射
│  └─ pose.js                      # 手动 / 方向模拟参考系
├─ mapping/
│  ├─ ruleEngine.js                # 扭转序列规则引擎（缓冲 + 最长后缀匹配）
│  ├─ config.js                    # v3 配置读取 / 保存 / 导出（无迁移）
│  ├─ defaultConfig.js             # 键位唯一权威来源 + 默认规则表生成器
│  ├─ notation.js                  # 扭转记法规范化
│  └─ api.js                       # window.CubeKeyboard 接口
├─ ime/
│  ├─ ImeBar.js                    # 悬浮输入法栏（拖动 / 缩放 / 分页候选 / 组词预览）
│  ├─ engines.js                   # 26键拼音 / 九键拼音 / 双拼 / 五笔预留 / 英文引擎
│  ├─ profiles.js                  # 汇总 src/configs/ime/*.json
│  ├─ t9Engine.js                  # 九键拼音引擎（数字切分 / 候选 / 选字，纯逻辑）
│  ├─ t9-dict.json                 # 音节 → 高频字（生成产物，约 33KB）
│  └─ candidates.js                # 拼音候选表（约 490 音节）
├─ configs/ime/                    # 每个输入法一个 JSON（含专属默认规则表）
├─ t9/                             # 九宫格模式实验模块（可整体删除，与输入法无关）
│  └─ T9Module.js                  # 右上角按钮挂载 / 键位显示 / 两次旋转定位 / 退出恢复
├─ ui/
│  ├─ panels.js                    # 侧栏交互总编排（切换 / 录制 / 编辑模式 / 九宫格开关）
│  └─ styles.css                   # 一体导轨侧栏 / 输入法栏 / 编辑弹窗 / 九宫格按钮主题
└─ utils/emitter.js                # 事件发射器

scripts/
├─ test-*.mjs                      # Node 逻辑测试（9 个）
├─ gen-ime-profiles.mjs            # 生成输入法 profile JSON（npm run gen:profiles）
├─ gen-t9-dict.mjs                 # 生成九键字库（npm run gen:t9-dict）
├─ patch-candidates.mjs            # 用字频数据补齐拼音候选表（一次性）
└─ data/charfreq-ModernMO.txt      # Jun Da 现代汉语字频表副本

tests/e2e/                          # Playwright 浏览器端到端用例
docs/                               # 计划书（现行 v0.4 + 已归档旧版）
```

## 测试

```bash
npm test             # Node 逻辑测试：模型 / 配置 / 规则 / 格子编号 / 九键引擎 / 输入法引擎 / 参考系 / 相机
npm run test:e2e     # Playwright：一体导轨侧栏动画、键位出字、五套输入法、规则导入导出、模拟触摸、编辑模式、九宫格模式、持久化
```

E2E 需要浏览器支持 WebGL（无头模式自动使用 swiftshader 软件渲染）。

## 已知限制与后续计划

- 当前不读取真实硬件方向 / 陀螺仪；方向模拟只是软件模拟。
- 当前不是系统级输入法，只是页面内虚拟输入法。
- 规则引擎只支持 `turn-sequence`；`state` 状态匹配规则保持未实现。
- 双拼为简版：一次处理一个音节，无整句 / 词组候选；五笔只预留接口（字库接入点见 `src/ime/engines.js` 与 profile JSON）。
- 拼音候选为单字候选，无词组。
- 九宫格触屏点按（点格子=按键）留待后续评估，当前只认旋转输入。

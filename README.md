# 反向扫雷 · 手机端兼容补丁

## 做了什么

最小化侵入式补丁，**不修改任何原有游戏逻辑和桌面端样式**：

| 文件 | 状态 | 说明 |
|------|------|------|
| `index.html` | 小幅修改 | 新增 viewport meta + 引入两个补丁文件 |
| `style-mobile.css` | **新增** | 仅通过 `html.is-mobile` 限定作用域，桌面端完全不生效 |
| `mobile.js` | **新增** | 设备检测、强制点选、长按删除、触摸适配 |
| `game.js` | **原样保留** | 字节级一致，零修改 |
| `audio.js` | **原样保留** | 字节级一致，零修改 |

## 三件核心事

### 1. 放置方式固定为点选
- 检测到触屏设备后，强制 `window._placeMode = 'click'`
- 移除所有 `draggable` 属性和 drag 事件绑定
- 隐藏模式切换按钮（桌面端仍保留拖拽/点选切换能力）

### 2. 侧边栏 → panel 内按钮
- 在原有 `.panel` 容器里动态插入 4 个快捷按钮：
  `📖规则` `💣信息` `⚙️菜单` `📝记录`
- 点击按钮 toggle 对应侧边栏的 `open` 类
- 隐藏桌面端左侧竖排 toggle 按钮（`toggleRuleSidebar` 等）
- 点击侧边栏外部自动关闭

### 3. 手机端 CSS 适配（追加，不修改原规则）
- viewport + 安全区域（`env(safe-area-inset-*)`）
- 棋盘格子尺寸由 JS 动态计算（`fitBoard()`），自适应屏幕宽度
- 弹窗/模态框全屏覆盖、按钮 min-height 44px（触摸友好）
- 横屏微调、<360px 超小屏兜底
- 禁用双击缩放、文本选中、系统长按菜单
- 飘落 emoji 性能降级

### 长按删除地雷
手机没有右键，补丁增加 550ms 长按检测：
- 在已放置地雷的格子上长按 → 触发删除
- 配合 `navigator.vibrate` 触觉反馈
- 长按后阻止后续 click，避免误触发放置

## 使用方式

直接在原目录中**新增两个文件**并**替换 index.html** 即可：

```
你的游戏目录/
├── index.html          ← 替换为补丁版（仅加 3 行）
├── style.css           ← 不动
├── style-mobile.css    ← 新增（桌面端自动忽略）
├── game.js             ← 不动
├── audio.js            ← 不动
└── mobile.js           ← 新增
```

用手机浏览器直接打开 `index.html` 即可。

## 检测逻辑

```
isTouch    = 'ontouchstart' in window || navigator.maxTouchPoints > 0
isSmall    = window.innerWidth < 900
isMobile   = isTouch && isSmall
```

满足时给 `<html>` 加 `is-mobile` class，所有补丁样式以此为准；
不满足时补丁文件自动降级，对桌面端零影响。

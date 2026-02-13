# Tran - Chrome 翻译扩展设计文档

## 概述

Chrome 扩展程序，用户在网页输入框中输入文本后，按下快捷键自动调用大模型将文本翻译为目标语言（默认英文）。支持流式输出，逐步替换原文。支持所有兼容 OpenAI 接口格式的大模型 API。

定位为通用翻译工具，不限定源语言，默认配置偏向中→英场景。典型使用场景：
- GitHub Issue/PR 中回复英文评论
- Stack Overflow 发帖或回答
- Gmail、Outlook Web 回复英文邮件
- Slack/Teams 发送英文消息

## 核心架构

采用 Chrome Manifest V3 架构，三个主要模块：

- **Content Script** - 注入网页，负责快捷键监听、输入框检测、文本替换、浮层状态显示和 Toast 错误提示
- **Service Worker (Background)** - 处理大模型 API 通信，包括流式请求的发起、中断和错误处理。Content Script 通过 `chrome.runtime.connect` 建立 port 连接，Service Worker 通过 port 将流式数据实时推回
- **Options Page** - 设置页面，配置存储在 `chrome.storage.local`（不同步，不收集数据）

API 调用放在 Service Worker 而非 Content Script，因为 Content Script 受页面 CSP 限制，直接发请求可能被拦截。

## 翻译交互流程

1. 用户在输入框中按下快捷键（默认 `Alt+T`）
2. Content Script 检测当前聚焦元素是否为 `input`、`textarea` 或 `contenteditable`，不是则忽略。密码字段（`input[type=password]`）禁止触发翻译
3. 获取翻译文本：有选中文本则取选中部分，否则从光标位置往前截取最多 N 个字符（N 为用户配置，默认 500）
4. 保存原文快照（用于失败回滚）
5. 在输入框旁显示 `✨ Translating...` 浮层提示
6. 通过 port 连接将文本发送给 Service Worker
7. Service Worker 调用大模型 API（streaming），逐步将翻译结果通过 port 推回
8. Content Script 收到流式数据后，逐步替换原文为译文
9. 翻译完成，移除浮层提示

### 中断机制

- **快捷键中断**：翻译过程中再次按下快捷键，Content Script 断开 port 连接，Service Worker 收到 `onDisconnect` 事件后 abort 请求，回滚到触发前原文
- **用户输入中断**：翻译过程中检测到用户在输入框中键入新内容，自动 abort 翻译并恢复原文（完全恢复，避免"半中半英"的混乱状态），避免流式替换与用户输入产生竞争导致文本错乱
  - 注意：必须正确处理中文输入法的 composition 事件。在 `compositionstart` 到 `compositionend` 期间忽略 `input` 事件，仅在 `compositionend` 之后才判断是否为用户主动输入，防止输入法预编辑阶段误触发中断

### 错误处理

- API 异常时，通过 Toast 弹窗提示错误信息（如"API Key 无效，请检查设置"、"请求超时"），3 秒后自动消失
- 未配置 API Key 时，Toast 提示可点击，直接跳转到 Options Page 引导用户完成配置
- 翻译失败时，自动将输入框内容恢复为触发前的中文原文，确保用户数据不丢失

### 撤销支持

使用 `document.execCommand('insertText')` 执行文本替换，使操作进入浏览器原生 undo 栈，用户可通过 Ctrl+Z (Cmd+Z) 撤销回中文原文。

## 设置页面配置项

单页布局，分三个区域，所有配置修改后自动保存。

### API 配置

- **API Base URL**：文本输入，placeholder 示例 `https://api.openai.com/v1`。自动标准化处理：移除尾部斜杠，若用户未输入 `/v1` 后缀则自动补全
- **API Key**：密码输入框，带显示/隐藏切换
- **Model**：文本输入，如 `gpt-4o`、`deepseek-chat`
- **测试连接按钮**：发送简单请求验证配置是否有效

### 翻译配置

- **目标语言**：下拉选择，默认英文，可选日文、韩文、法文等常见语言
- **自定义 Prompt**：提供风格预设下拉选项（正式 / 简洁 / 口语），选择后自动填充对应 Prompt 模板。同时保留自定义文本域，用户可在预设基础上修改。默认预设为"简洁"，Prompt 值 `Translate the following text to {{target_language}}. If the text is already in the target language, return it as-is. Output only the translated text, nothing else.`
- **最大翻译字符数**：数字输入，默认 500

### 快捷键配置

- 使用 `chrome.commands` API 注册快捷键，用户可在 `chrome://extensions/shortcuts` 中统一管理
- 平台默认值：macOS `Ctrl+Shift+T`，Windows/Linux `Alt+T`（macOS 上 `Alt` 键会产生特殊字符，不可用作快捷键）
- Options Page 中显示当前快捷键，并提供跳转到 `chrome://extensions/shortcuts` 的引导链接

## 首次使用引导

- 扩展安装后自动打开 Options Page，引导用户完成 API 配置
- Options Page 顶部显示 Quick Start 指引，简要说明在哪里获取 API Key（如 OpenAI Platform、DeepSeek 控制台）
- 未配置 API Key 时触发快捷键，Toast 提示可点击，直接跳转到 Options Page

## 技术实现要点

### 文本替换策略

- `input` / `textarea`：通过 `selectionStart`、`selectionEnd` 定位文本范围，使用 `document.execCommand('insertText')` 替换，触发 `input` 事件确保框架（React、Vue 等）感知变化
- `contenteditable`：通过 `window.getSelection()` 获取选区，使用 `Range` API 定位，`execCommand` 替换。若 DOM 替换失败（复杂编辑器场景），降级为弹出译文面板，提供"一键复制"按钮，用户手动粘贴

### 流式替换

维护"原文范围"的起止位置，每次收到新 chunk 时，用当前累积的完整译文替换该范围内容，并更新范围结束位置。避免逐字追加导致的光标跳动。

对流式 DOM 更新进行 throttle（50-100ms），防止高频 token 输出导致 UI 卡顿或框架状态同步异常。

### Prompt 构造

- System message：用户自定义 prompt（`{{target_language}}` 替换为实际目标语言）
- User message：待翻译的原文

### 浮层定位

`✨ Translating...` 浮层绝对定位，锚定输入框右上角。通过 `getBoundingClientRect()` 计算位置，监听滚动和 resize 保持跟随。当输入框位于视口边缘导致浮层溢出时，自动翻转位置（如切换到左上角或输入框内部）。

### `execCommand` 隔离

`execCommand` 虽已标记为 deprecated，但目前是唯一能保留浏览器原生 Undo 栈的方式。将其使用隔离在 `replacer.ts` 中，未来若 Chrome 提供替代 API（如 `InputEvent` + `ClipboardAPI`），可在此模块内替换而不影响其他逻辑。

## 项目结构

```
tran/
├── manifest.json
├── src/
│   ├── background/
│   │   └── service-worker.ts    # API 调用、流式处理、port 通信
│   ├── content/
│   │   ├── index.ts             # 快捷键监听、文本检测与替换
│   │   ├── overlay.ts           # 浮层提示（翻译中/错误）
│   │   └── replacer.ts          # 三种输入元素的替换逻辑
│   ├── options/
│   │   ├── options.html         # 设置页面
│   │   ├── options.ts           # 设置逻辑
│   │   └── options.css
│   └── shared/
│       ├── types.ts             # 类型定义
│       ├── constants.ts         # 默认配置值
│       └── storage.ts           # chrome.storage.local 封装
├── package.json
├── tsconfig.json
└── vite.config.ts               # Vite + @crxjs/vite-plugin
```

## 技术栈

- TypeScript
- Vite + `@crxjs/vite-plugin`（支持 HMR，开发体验好）
- 无 UI 框架，设置页面原生 HTML/CSS（扩展体积小，页面简单无需框架）

## 一期范围

- 支持 `input`、`textarea` 和基础 `contenteditable` 元素
- 通用场景优先（GitHub、Stack Overflow、邮件、社交媒体等）
- Notion、Google Docs 等特殊编辑器的适配留到后续迭代

## API 兼容边界

### 必须支持

1. Endpoint：`POST {base_url}/chat/completions`
2. Auth：`Authorization: Bearer <api_key>`
3. Request 字段：`model`、`messages`、`stream`
4. Stream 协议：SSE，从 `choices[0].delta.content` 提取文本

### 明确不承诺

1. 厂商私有签名机制
2. 非 `chat/completions` 端点（如 responses/reasoning 私有扩展）
3. 与标准字段不兼容的流式格式

## 安全与隐私

1. 禁止在密码类字段（`input[type=password]`）执行翻译
2. 日志中不得打印 API Key、完整原文、完整译文
3. 配置页明确告知"数据直连用户配置的模型服务，不经过中间服务器"

## 验收标准

### 场景验收

1. 用户已配置有效 API，在 `textarea` 按快捷键，应在 3 秒内看到首段译文（网络正常）
2. 翻译进行中再次按快捷键，应停止翻译且内容完整回滚为触发前原文
3. 翻译进行中用户主动输入，应停止翻译且内容完整回滚为触发前原文
4. 中文输入法预编辑阶段仅触发 `input` 事件不应导致误中断，`compositionend` 后输入才可触发中断
5. API Key 缺失时触发翻译，应出现可点击错误提示并能跳转设置页
6. 用户执行 `Cmd/Ctrl+Z`，应撤销到翻译前文本状态

### 兼容性矩阵

1. 必测网站：GitHub、Stack Overflow、Gmail、Outlook Web、Slack Web
2. 必测元素：`input`、`textarea`、基础 `contenteditable`
3. 平台：macOS、Windows（Chrome 最新稳定版）

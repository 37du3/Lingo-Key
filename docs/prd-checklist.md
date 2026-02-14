# Tran PRD Checklist

Last updated: 2026-02-14

## P0 Must-Have

| Requirement | Source | Status | Evidence |
|---|---|---|---|
| 支持 `input` / `textarea` / `contenteditable` 触发翻译，排除 password | PRD 交互流程 | DONE | `src/content/index.ts` |
| 支持流式输出（普通输入控件）并进行节流 | PRD 流式替换 | DONE | `src/content/index.ts`, `src/shared/constants.ts` |
| Service Worker 负责 API 调用与流式回传 | PRD 核心架构 | DONE | `src/background/service-worker.ts` |
| 未配置 API Key 时可点击提示并跳转设置页 | PRD 错误处理/FTUE | DONE | `src/content/index.ts`, `src/background/service-worker.ts` |
| 首次安装自动打开 Options Page | PRD 首次使用引导 | DONE | `src/background/service-worker.ts` |
| 复杂编辑器（Kimi/Perplexity 等）回退复制方案可用 | PRD contenteditable 降级 | DONE | `src/content/replacer.ts`, `src/content/index.ts` |
| Base URL 规范（`/v1`）与请求端点契约一致 | PRD API 配置 | DONE | `src/shared/storage.ts`, `src/background/api-client.ts` |
| 日志不输出 API Key/完整原文/完整译文 | PRD 安全与隐私 | DONE | `src/shared/logger.ts`, `src/background/service-worker.ts`, `src/content/index.ts` |

## P1 UX/配置完整性

| Requirement | Source | Status | Evidence |
|---|---|---|---|
| 设置页包含 API/Translation/Shortcut 全部配置 | PRD 设置页面 | DONE | `src/options/options.html`, `src/options/options.ts` |
| 设置页显示并可直接修改当前快捷键（无需外跳） | 快捷键配置更新 | DONE | `src/options/options.html`, `src/options/options.ts`, `src/content/index.ts` |
| Prompt 预设 + 自定义文本可协同保存 | PRD 翻译配置 | DONE | `src/options/options.ts` |
| 浮层支持边界翻转且滚动/resize 跟随 | PRD 浮层定位 | DONE | `src/content/overlay.ts` |

## P2 Runtime Robustness

| Requirement | Source | Status | Evidence |
|---|---|---|---|
| 快捷键二次触发可中断并回滚（普通输入） | PRD 中断机制 | DONE | `src/content/index.ts` |
| 用户输入中断处理 + IME composition 保护 | PRD 中断机制 | DONE | `src/content/index.ts` |
| 撤销栈支持（`execCommand('insertText')`） | PRD 撤销支持 | DONE | `src/content/replacer.ts` |

## Pending Closure Items

当前清单项均已闭环，后续仅保留跨平台手测（macOS/Windows）与站点矩阵补测。

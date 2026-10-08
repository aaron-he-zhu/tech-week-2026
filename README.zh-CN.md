# Tech Week 2026 · SF 与 LA 活动指南

[English（默认）](README.md) · 简体中文

手机阅读优先的独立双语活动指南：[英文网站](https://tech-week-2026-guide.aaron-he-zhu.workers.dev/) · [中文网站](https://tech-week-2026-guide.aaron-he-zhu.workers.dev/zh/)。

线上指南覆盖 **SF、LA 官方活动与 30 个专题**；当前活动数与最近核对时间见[线上网站](https://tech-week-2026-guide.aaron-he-zhu.workers.dev/zh/)。公开源码默认使用 **30 场虚构演示活动**，英文、中文各 37 页。专题按场次数量排序，活动按时间排序。支持列表、日历视图及只看有地址爆料的活动。支持免注册 Wishlist、公开昵称、地址爆料、录音转写链接分享、去过并打分，以及可选的 Google 登录和跨设备恢复。

## 本地运行

需要 **Node.js 24** 和 **Python 3.13**：

```sh
cd website
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements-dev.txt
npm ci
npm run verify
npm run preview:wishlist
```

打开 `http://127.0.0.1:4173/`。默认配置连接本地 SQLite，不需要 Cloudflare 凭证。Windows PowerShell 使用 `.venv\Scripts\Activate.ps1` 激活虚拟环境。`npm run preview` 只提供静态页面；互动功能使用 `preview:wishlist`。

默认构建使用 `examples/demo/` 的虚构资料。线上内容独立保存，通过 `TECH_WEEK_CONTENT_DIR` 指向已授权的内容目录；详见[内容格式](docs/content.md)。访问和语言切换不调用 AI 或翻译服务；首页互动统计直接读取 API，不依赖重新构建。

## 项目结构

| 路径                     | 职责                                        |
| ------------------------ | ------------------------------------------- |
| `website/templates/`     | 自动转义的页面模板                          |
| `website/public/assets/` | 共用浏览器逻辑与手机适配样式                |
| `website/backend/`       | Workers API、身份验证、参数校验和 D1 表结构 |
| `website/scripts/`       | 构建、翻译、数据校验和部署配置              |
| `website/src/`           | 专题定义、界面标签与译文                    |
| `website/tests/`         | 本地 API、身份、翻译和渲染回归测试          |
| `examples/demo/`         | 虚构活动、示例归类证据及内容文件            |

## 质量检查

`npm run verify` 包含 Prettier/Ruff 格式检查、JavaScript/Python 静态检查、两次干净构建的逐字节一致性校验、日历覆盖与双语数据校验，以及自动化测试。`npm run format` 应用统一格式。构建先写临时目录，渲染失败时保留上一份 `dist/`。

GitHub Actions 还使用固定版本、校验过下载摘要的 Gitleaks 扫描 Git 历史。PR 只检查；开启部署的 `main` 推送依次发布 API 和网站，再进行只读验证。部署需要显式配置，不自动执行数据库迁移，也不向线上写入测试内容。已有数据库须在发布此版本前完成一次[转写链接建表升级](docs/deployment.md#upgrading-existing-databases-for-transcript-links)，不修改原有用户记录。

## 双语维护

英文使用 `/`，中文使用 `/zh/`。切换语言保留页面、搜索、筛选和分享或恢复链接片段，两种语言共用 Wishlist 与登录身份。活动原名、主办方名称和访客提交内容保留原文。

译文位于 `website/src/locales/en.json`。浏览器文案通过 JavaScript 语法节点编译，保留代码、转义及模板表达式；缺少译文时停止构建。更多说明见 [网站文档](website/README.zh-CN.md)。

开发与部署请参阅 [贡献指南](CONTRIBUTING.md)、[架构说明](docs/architecture.md)、[部署说明](docs/deployment.md) 和 [安全政策](SECURITY.md)。

原创代码和文档采用 [MIT](LICENSE)。**第三方活动文案、图片、商标及来源资料不因此获得 MIT 授权。** 请阅读 [来源与授权说明](NOTICE.md)。

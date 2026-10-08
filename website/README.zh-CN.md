# Tech Week 2026 SF · LA 活动指南

[English（默认）](README.md) · 简体中文

手机阅读优先的独立双语指南：[英文网站](https://tech-week-2026-guide.aaron-he-zhu.workers.dev/) · [中文网站](https://tech-week-2026-guide.aaron-he-zhu.workers.dev/zh/)。

## 演示与线上内容

公开源码默认构建 30 场虚构活动，每个专题一场，并显示演示提示。线上指南使用独立保存的 SF、LA 第三方内容，活动数与核对时间由该内容快照提供。原始活动快照、主办方全文和用户记录不随源码公开；见[内容格式](../docs/content.md)。

全部活动、专题和 Wishlist 页均支持列表 / 日历切换、点选日期，以及“只看有爆料地址”。日历显示其他筛选条件下的每日场次，跨日活动计入覆盖的每一天，采用太平洋时间日历日期。视图和筛选保存在网址中，切换语言时保留。

地址筛选读取 `/v1/community/address-events`，仅返回活动 ID 和当前有效爆料条数。启用筛选时，前台每 30 秒刷新；本人的修改或撤回会立即更新。请求失败明确提示重试，保留的旧结果会标明更新失败。

## 本地构建与验证

需要 Node.js 24、Python 3.13。在本目录执行：

```sh
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements-dev.txt
npm ci
npm run verify
npm run preview:wishlist
```

完整预览在 `http://127.0.0.1:4173`，SQLite 数据位于 `.local/wishlist.sqlite`，与线上 D1 隔离。`npm run preview` 只提供静态文件。默认构建使用本地网址，线上发布需要显式配置。

`verify` 执行格式检查、ESLint/Ruff、两次独立构建的字节一致性检查、内容校验和行为测试。内容校验涵盖活动唯一性、专题依据、数量、排序、内部链接及双语数据一致性；行为测试使用本地数据库和测试签名密钥，不写入线上记录。

## 代码结构与分类

- `scripts/build.py` 使用 `templates/` 中的 Jinja 模板生成页面，在临时目录完成后替换 `dist/`。输出英文、中文各 37 个 HTML 文件，同时生成 API 活动白名单。
- `<content>/website/src/snapshot.json` 指向当前官方全文快照；`src/topics.json` 定义专题，`<content>/website/src/topic_membership.json` 保存经过核对的专题成员与依据。
- `<content>/website/src/briefs.json` 与 `src/calendar-labels.json` 提供编辑简介及日历标签；`<content>/website/src/refresh.json` 保存变化记录。
- `<content>/website/src/luma_links.json` 保存已配对来源，`<content>/website/src/system_one_review.json` 保存决策模型核对结果。
- `public/assets/` 保存共享样式与浏览器逻辑；`backend/` 保存互动 API 和数据库结构。

AI 陪伴参照 Character.ai / Zeta / Tipsy，个人助理参照 Muse / Cue / Dots / Instinct，以明确议程依据区分。System 1 决策模型已并入 Agent Harness，实时语音或一般低延迟本身不构成归类依据。记忆、上下文、检索与知识库统一在 `agent-memory`；旧的 `system-one`、`ai-search` 地址在两种语言中均跳转到合并后的专题。宽泛的企业 AI、AI 创业与融资专题已移除，相关参会目的筛选保留。

## 英语优先与中文切换

英语在 `/`，中文在 `/zh/`。两种语言共享活动 ID、分类、日期、状态和互动数据，生成对应的 canonical、alternate 链接及 CSV。切换语言保留当前页、筛选、排序、搜索和恢复链接片段，不创建新的访客身份。

词库位于 `src/locales/en.json`。构建期翻译界面、专题、编辑简介和更新摘要，遗漏词条会导致构建失败。JavaScript 由 Acorn 解析，只转换字符串与模板文本，不对整个源文件进行词语替换。活动原名、主办方、用户昵称和爆料内容保持原文；访客使用时不调用 AI 或翻译服务。

## 想去、地址爆料与评分

免注册访客通过浏览器保存的随机凭证管理清单，服务端只存凭证摘要。恢复链接使用 URL fragment，读取后从地址栏移除；只读分享使用独立、可撤销凭证。公开人数按身份去重，不等于经验证的真人数量；昵称自愿填写，公开展示范围会在界面说明。

收藏保留当时的活动快照；活动变化会提示，移出日历的收藏仍可查看。每个身份对每场活动可提交一条可编辑、可撤回的地址爆料，公开显示昵称和时间，标记为访客提供、未经主办方核实。评分要求确认参加、活动已开始且为整数 1–5 分；修改替换旧评分。只读分享不能以清单主人身份写入。

首页通过只读接口 `/v1/community/stats` 获取当前有效爆料条数和涉及活动数。前台每 30 秒及回到页面、恢复网络时刷新；修改不重复计数，撤回扣减。这个口径不包括已撤回记录，不需要 AI token 或重新发布。

## 可选 Google 登录

点击登录后才加载 Google Identity Services。API 验证签名、签发者、受众、时效和与会话绑定的一次性 nonce，以 Google `sub` 关联账号。邮箱只向本人显示，不自动成为公开昵称，不申请 Gmail、通讯录、日历或 Drive 权限。

首次登录以事务合并匿名数据：收藏去重，地址与评分保留最近修改的记录，已有账号保留昵称。旧匿名恢复、分享凭证会失效；登录后可以重新开启分享。会话有效期 30 天，退出撤销当前设备会话，不删除数据。

测试覆盖签名校验、合并、冲突、重放拒绝和事务回滚。真实账号的完整浏览器登录尚未完成验证：此前 Codex 内置浏览器阻止加载 Google 官方脚本，需在允许 Google Identity Services 的普通浏览器中补测。未配置客户端 ID 时不显示登录入口。

## 发布与贡献

推送或合并到 `main` 后，GitHub Actions 扫描 Git 历史、完成检查，再按已配置的开关先发布 API、后发布网站，最后进行只读线上验证。PR 只执行检查，不部署。日常发布不会自动执行数据库迁移或写入测试贡献。

详见[贡献指南](../CONTRIBUTING.md)、[架构说明](../docs/architecture.md)、[部署配置](../docs/deployment.md)和[安全问题报告](../SECURITY.md)。项目代码使用 MIT 许可证，第三方活动资料不自动适用 MIT，具体边界见 [NOTICE.md](../NOTICE.md)。

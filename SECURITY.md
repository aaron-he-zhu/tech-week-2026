# Security

Security fixes are maintained on `main`. This small project has no separate long-term support branches.

Please report suspected vulnerabilities privately to the maintainer at **zhuhe1983@gmail.com**. Include the affected commit, a minimal reproduction using synthetic data and the expected impact. Do not include a real visitor token, recovery URL, Google credential or database export. Do not post working exploits or private user data in public issues.

Authentication, account merges, contribution ownership, shared-link permissions and safe rendering are covered by local regression tests. These checks and automated secret scanning are not a claim of a comprehensive security audit.

Anonymous counts represent distinct stored identities, not verified individuals. Attendance is self-reported. Public contributions are visitor-submitted and are not organizer-confirmed addresses. Rate limits reduce simple abuse but do not prove identity.

Git history is scanned by a pinned Gitleaks release without credential-pattern exceptions. CI also rejects private source snapshots and runtime state in the public tree. Never add broad scanner exclusions to silence a finding.

Deployers must use their own Cloudflare account, database and OAuth client. Keep production API credentials in GitHub Secrets or an equivalent secret store. Repository variables contain only non-secret deployment identifiers and URLs. See [deployment instructions](docs/deployment.md).

中文：安全问题请私下联系维护者，并使用合成测试数据复现。不要在公开 Issue 中提交真实身份凭证、恢复链接、Google 凭证或数据库导出。本地测试和自动扫描不等于完整安全审计。

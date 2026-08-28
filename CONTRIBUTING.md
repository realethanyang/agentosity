# 贡献指南 / Contributing

感谢你想给 Agentosity 添砖!提 PR 前请了解两件事:

## 流程

1. Fork → 开分支 → 提 Pull Request 到 `main`;
2. `main` 受保护:所有变更必须走 PR,由维护者(@realethanyang)审核合并;
3. 新增 harness 探针/适配是最受欢迎的贡献(参考 `packages/cli/src/probes.js` 与 `harness-config.js`,几十行一个)。

## 贡献者授权条款(CLA)

本仓库采用分目录授权(见 [LICENSE.md](LICENSE.md)):客户端 MIT,服务端 AGPL-3.0。

提交 PR 即表示你同意:

1. 你的贡献是你的原创作品,或你有权提交它;
2. 你的贡献以所在目录的现行协议授权发布(inbound = outbound);
3. **你授予项目维护者(Ethan Yang)一项永久、全球、免版税的权利,可将你的贡献
   以其他协议再授权或双重授权**(例如为企业提供商业授权,或未来调整开源协议)。
   你保留你贡献的著作权。

第 3 条是本项目能维持"开源 + 商业授权"双轨模式的前提;如果你不同意,请在 PR 中说明,我们会单独讨论。

## 开发

```bash
pnpm install && pnpm dev          # web
apps/menubar/build-app.sh          # mac App
node packages/cli/bin/agentosity.js help
```

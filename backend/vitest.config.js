import { defineConfig } from "vitest/config";
import { cloudflarePool, cloudflareTest } from "@cloudflare/vitest-pool-workers";

// 全部测试跑在 workers 池（真实 workerd + miniflare 内存绑定 KV/R2/DO）。
// cloudflareTest 插件：提供 cloudflare:test 模块别名与配置校验；
// cloudflarePool：vitest 4 的池运行器。集成测试经 SELF/env 直调 Worker 与绑定。
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.test.toml" } })],
  test: {
    pool: cloudflarePool({ wrangler: { configPath: "./wrangler.test.toml" } }),
    /* 只收 backend/tests（Worker/DO/KV 域）——windows/macos 壳单测依赖 electron（node 池），
     * 与 workers 池互斥：各壳用自身 vitest.config.js 独立跑（cd windows|macos && npx vitest run）。
     * 壳轮之前根配置未限定 include，默认全仓扫描曾把壳测试卷进 workers 池致 require 失败。 */
    include: ["tests/**/*.test.js"],
    /* 测试沙箱注册口令（一次性用户，隔离环境逐测试回滚；tests/helpers/test-creds.js 消费） */
    env: { SUVEOO_TEST_PW: "sandbox-test-user" },
  },
});

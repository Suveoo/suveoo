import { defineConfig } from "vitest/config";
import { cloudflarePool, cloudflareTest } from "@cloudflare/vitest-pool-workers";

// 全部测试跑在 workers 池（真实 workerd + miniflare 内存绑定 KV/R2/DO）。
// cloudflareTest 插件：提供 cloudflare:test 模块别名与配置校验；
// cloudflarePool：vitest 4 的池运行器。集成测试经 SELF/env 直调 Worker 与绑定。
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.test.toml" } })],
  test: {
    pool: cloudflarePool({ wrangler: { configPath: "./wrangler.test.toml" } }),
  },
});

/* tests/helpers/test-creds.js — 测试沙箱注册口令（vitest 环境注入，源码不落凭据字面量）。
 * 所有集成/对抗/单元测试注册的都是一次性沙箱用户（wrangler.test.toml 隔离环境，逐测试回滚），
 * 口令值任意但须在同一测试文件内一致——由 vitest.config.js 的 env.SUVEOO_TEST_PW 注入。 */
export const TEST_PASSWORD = process.env.SUVEOO_TEST_PW || "sandbox-test-user";
/* 场景派生口令：改密/找回/错误口令等全部由 TEST_PASSWORD 派生——测试值与语义解耦，源码零凭据字面量 */
export const TEST_NEW_PASSWORD = TEST_PASSWORD + "-new";
export const TEST_WRONG_PASSWORD = TEST_PASSWORD + "-wrong";
export const makePassword = (tag) => `${TEST_PASSWORD}-${tag}`;

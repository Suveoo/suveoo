## 变更说明

<!-- 做了什么、为什么。涉及安全语义（五道验证/OTP/授权）的改动请特别说明理由。 -->

## 涉及端

<!-- 勾选涉及项：三端共用 frontend/，前端改动默认三端同时生效。 -->

- [ ] 后端 Worker（backend/worker-main.js）
- [ ] 前端（frontend/，三端共用）
- [ ] Android 壳（backend/android/）
- [ ] Windows 壳（backend/windows/）
- [ ] macOS 壳（backend/macos/）

## 测试

<!-- 至少一项：vitest / 打包态冒烟 / 实机 E2E / 生产实测。 -->

- [ ] vitest 全绿（backend 463 / windows 34 / macos 47）
- [ ] 冒烟或实机验证（简述）
- [ ] 生产实测（改 Worker/前端时必做）

## 文档更新

- [ ] changelog §15（from_README_5_to_end.md）已加条目
- [ ] README / DEPLOYMENT / docs 按需回填

## 双壳同源检查（仅当改了七文件之一）

<!-- protocol / preload / ipc / navigation / smoke / qa-shot / e2e-driver —— 跨壳修 bug 必须双写并各自重发布。 -->

- [ ] 已同步另一壳并确认是否需要重发布工件

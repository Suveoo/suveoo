/* auth.js — 会话状态 */
S.auth = {
  _session: undefined, // 缓存（undefined=未查询）
  async session(force = false) {
    if (this._session !== undefined && !force) return this._session;
    if (!S.api.token) { this._session = null; return null; }
    const r = await S.api.get("/api/session");
    this._session = r.ok ? r.data : null;
    return this._session;
  },
  async login(identifier, password) {
    const r = await S.api.post("/api/auth/login", { identifier, password });
    if (!r.ok) return r;
    if (r.data.mfa_required) return r; // 前端进入 2FA 步骤
    S.api.token = r.data.token;
    this._session = undefined;
    return r;
  },
  async mfa(mfaToken, code) {
    const r = await S.api.post("/api/auth/mfa", { mfa_token: mfaToken, code });
    if (r.ok) { S.api.token = r.data.token; this._session = undefined; }
    return r;
  },
  async logout() {
    await S.api.post("/api/auth/logout", {}).catch(() => {});
    S.api.token = null;
    this._session = null;
    location.replace("/home");
  },
};

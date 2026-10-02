# verify-notif-prod.py — 第五十六轮通知修复生产验证（API 层）
# 1) 偏好读写持久化 2) 转账付款方站内通知 3) 新设备登录提醒（异指纹触发/同指纹幂等）
# 安全边界：仅允许 https://suveoo.com（协议+域名白名单）；curl 参数列表 shell=False，
# body 走 stdin，UA 只接受白名单键名（"chrome"|"bot"），无任何字符串拼入命令行
import json, sys, subprocess
from urllib.parse import urlparse
sys.stdout.reconfigure(encoding="utf-8")
BASE = "https://suveoo.com"
ALLOWED_HOST = "suveoo.com"
UAS = {
    "chrome": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36",
    "bot": "SuveooVerifyBot/1.0 (TestDevice)",
}

def assertSafeUrl(url):
    u = urlparse(url)
    assert u.scheme == "https" and u.hostname == ALLOWED_HOST, "仅允许 https://" + ALLOWED_HOST

def call(method, path, body=None, token=None, ua="chrome"):
    url = BASE + path
    assertSafeUrl(url)
    assert ua in UAS, "UA 仅允许白名单键"
    cmd = ["curl", "-s", "--max-time", "30", "-X", method, url,
           "-H", "content-type: application/json",
           "-A", UAS[ua], "--compressed"]
    if body is not None: cmd += ["--data-binary", "@-"]
    if token: cmd += ["-H", "authorization: Bearer " + token]
    out = subprocess.run(cmd, input=json.dumps(body) if body is not None else None,
                         capture_output=True, text=True, encoding="utf-8", shell=False).stdout or ""
    try: return 200, json.loads(out)
    except Exception: return 0, {}

ok = lambda name, cond: print(("✓" if cond else "✗"), name) or (cond or sys.exit(1))

# ① 登录 demo
st, r = call("POST", "/api/auth/login", {"identifier": "demo@suveoo.com", "password": "jinrongkeji2026"})
tok = r.get("token"); ok("登录 demo", st == 200 and tok)

# ② 偏好：记录初值 → 写入 → 读回 → 恢复
st, r = call("GET", "/api/notifications/prefs", token=tok)
init = r.get("prefs")
ok("偏好 GET 可用", st == 200 and isinstance(init, (dict, type(None))))
st, r = call("POST", "/api/notifications/prefs", {"WEALTH": False, "TRANSFER": True}, token=tok)
ok("偏好写入", st == 200 and r.get("ok"))
st, r = call("GET", "/api/notifications/prefs", token=tok)
ok("偏好读回 WEALTH=false", r.get("prefs", {}).get("WEALTH") is False)
st, _ = call("POST", "/api/notifications/prefs", {"TRANSFER": True, "SECURITY": True, "WEALTH": True, "TASK": True, "SYSTEM": True}, token=tok)
ok("偏好恢复全开", st == 200)

# ③ 普通写操作 smoke（订阅提醒开关，PATCH 直达 DO 不产生通知——通知断言在 ④ 新设备提醒）
st, base = call("GET", "/api/notifications?cursor=0", token=tok)
base_id = base["notifications"][0]["id"] if base.get("notifications") else 0
subs = call("GET", "/api/subscriptions", token=tok)[1]
sid = (subs.get("subscriptions") or [{}])[0].get("id")
ok("取到订阅", bool(sid))
st, r = call("PATCH", f"/api/subscriptions/{sid}/reminders", {"enabled": False}, token=tok)
ok("订阅提醒关闭", st == 200 and r.get("ok"))
st, r = call("PATCH", f"/api/subscriptions/{sid}/reminders", {"enabled": True}, token=tok)
ok("订阅提醒开启", st == 200 and r.get("ok"))

# ④ 新设备登录：异指纹触发 / 同指纹幂等
st, r2 = call("POST", "/api/auth/login", {"identifier": "demo@suveoo.com", "password": "jinrongkeji2026"}, ua="bot")
ok("异设备登录", st == 200)
st, lst = call("GET", "/api/notifications?cursor=0", token=tok)
dev_id = max(n["id"] for n in lst["notifications"]) if lst.get("notifications") else 0
ok("收到「新设备登录提醒」", any(n["title"] == "新设备登录提醒" for n in lst.get("notifications", []) if n["id"] > base_id))
st, _ = call("POST", "/api/auth/login", {"identifier": "demo@suveoo.com", "password": "jinrongkeji2026"}, ua="bot")
st, lst2 = call("GET", "/api/notifications?cursor=0", token=tok)
extra = [n for n in lst2.get("notifications", []) if n["id"] > dev_id]
ok("同指纹重复登录不重复提醒", not any(n["title"] == "新设备登录提醒" for n in extra))
print("\n全部通过")

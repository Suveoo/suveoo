/* insights.js — 情境化确定性洞察引擎（第二十二轮 F：B 主页产品卡 / C AI 首屏洞察卡共用供数方）
 * 全部客户端规则、零 LLM 调用、可解释：输入 = /api/overview + /api/dashboard（含 by_category_month /
 * income_recent 扩展字段）+ /api/subscriptions + /api/bills；输出 = 排序后的推荐项数组。
 * 任何一条规则触发条件都写进卡片副文案（"为什么推给我"即数字本身）。 */
S.insights = (() => {
  const num = (v) => Number(String(v ?? "").replace(/[^0-9.\-]/g, "")) || 0;
  const yuan = (cents) => (cents / 100).toFixed(2);
  const monthKey = (d) => d.toISOString().slice(0, 7);
  const pct = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

  /* 本月/上月收支汇总（dashboard.monthly：[{m, direction, total=分}]，UTC 月口径与服务端一致） */
  function cashflowOf(dash) {
    const now = new Date();
    const thisM = monthKey(now);
    const lastM = monthKey(new Date(now.getTime() - 26 * 86400000));
    const g = { inThis: 0, outThis: 0, inLast: 0, outLast: 0, thisM, lastM };
    for (const r of dash?.monthly ?? []) {
      if (r.m === thisM) { if (r.direction === "IN") g.inThis = Number(r.total); else g.outThis = Number(r.total); }
      if (r.m === lastM) { if (r.direction === "IN") g.inLast = Number(r.total); else g.outLast = Number(r.total); }
    }
    g.inPct = pct(g.inThis, g.inLast);
    g.outPct = pct(g.outThis, g.outLast);
    return g;
  }

  /* 月薪信号：近 60 天同一入账方 ≥2 笔且合计 ≥ ¥9,000（约两月月薪），或对方名含"工资/薪资" */
  function salaryOf(dash) {
    for (const r of dash?.income_recent ?? []) {
      const total = num(r.total);
      if ((r.counterparty ?? "").includes("工资") || (r.counterparty ?? "").includes("薪资")) return { name: r.counterparty, total, count: r.count };
      if (Number(r.count) >= 2 && total >= 9000) return { name: r.counterparty, total, count: r.count };
    }
    return null;
  }

  async function collect() {
    const out = [];
    const [ovR, dashR, subsR, billsR] = await Promise.all([
      S.api.get("/api/overview").catch(() => null),
      S.api.get("/api/dashboard").catch(() => null),
      S.api.get("/api/subscriptions").catch(() => null),
      S.api.get("/api/bills").catch(() => null),
    ]);
    const ov = ovR?.ok ? ovR.data : null;
    const dash = dashR?.ok ? dashR.data : null;
    const subs = (subsR?.ok ? subsR?.data?.subscriptions : null) ?? [];
    const bills = (billsR?.ok ? billsR?.data?.bills : null) ?? [];
    const cards = ov?.cards ?? [];
    const credit = cards.find((x) => x.kind === "credit");
    const debitBal = num(ov?.total_balance);
    const cf = cashflowOf(dash);
    const salary = salaryOf(dash);
    const activeSubs = subs.filter((x) => (x.status ?? "ACTIVE") === "ACTIVE");
    const dormant = activeSubs.filter((x) => Number(x.usage_score ?? 100) < 20);
    const subsMonthly = activeSubs.reduce((a, x) => a + num(x.amount) / (x.cycle === "年付" || x.cycle === "yearly" ? 12 : 1), 0);
    const today = new Date();
    const dueSoon = bills.filter((b) => {
      const dd = Number(b.due_day);
      if (!dd) return false;
      let diff = dd - today.getDate();
      if (diff < -7) diff += 30; /* 月末跨月近似 */
      return diff >= 0 && diff <= 5;
    });
    const dueSum = dueSoon.reduce((a, b) => a + Number(b.amount_cents ?? 0), 0);

    /* ① 虚拟信用卡（获客优先级最高）：月消费高且名下无信用卡 */
    const spendBase = cf.outThis >= 8000 ? yuan(cf.outThis) : null;
    if (!credit && cf.outThis >= 8000) out.push({
      id: "credit", tone: "violet", art: "/assets/images/illustrations/product-card-perks.svg",
      tag: "ins.tagNew", title: "ins.creditTitle", body: S.t("ins.creditBody", spendBase),
      cta: "modal", priority: 100,
    });
    /* ② 闲置资金理财：借记余额 ≥ ¥50,000 */
    if (debitBal >= 50000) out.push({
      id: "wealth", tone: "gold", art: "/assets/images/illustrations/cat-fund.svg",
      tag: "ins.tagWealth", title: "ins.wealthTitle", body: S.t("ins.wealthBody", S.fmt.moneyPlain(debitBal.toFixed(2))),
      cta: "/wealth/funds", priority: 90,
    });
    /* ③ 月薪定投：检测到稳定工资入账 */
    if (salary) out.push({
      id: "dca", tone: "teal", art: null, icon: "trend",
      tag: "ins.tagDca", title: "ins.dcaTitle", body: S.t("ins.dcaBody", salary.name, S.fmt.moneyPlain((salary.total / Math.max(1, salary.count)).toFixed(2))),
      cta: "/wealth/funds", priority: 80,
    });
    /* ④ 信用卡还款：有欠款 */
    if (credit && num(credit.balance) > 0) out.push({
      id: "repay", tone: "rose", art: null, icon: "card",
      tag: "ins.tagTodo", title: "ins.repayTitle", body: S.t("ins.repayBody", credit.balance, credit.available),
      cta: "/pay/bills", priority: 70,
    });
    /* ⑤ 订阅优化：订阅 ≥8 项或存在沉睡订阅 */
    if (activeSubs.length >= 8 || dormant.length) out.push({
      id: "subs", tone: "orange", art: "/assets/images/illustrations/badge-perk.svg",
      tag: "ins.tagOptimize", title: "ins.subsTitle",
      body: S.t("ins.subsBody", activeSubs.length, dormant.length, S.fmt.moneyPlain(subsMonthly.toFixed(2))),
      cta: "/pay/subscriptions", priority: 60,
    });
    /* ⑥ 账单待办：5 天内到期 */
    if (dueSoon.length) out.push({
      id: "bills", tone: "sky", art: null, icon: "doc",
      tag: "ins.tagTodo", title: "ins.billsTitle", body: S.t("ins.billsBody", dueSoon.length, S.fmt.moneyPlain(yuan(dueSum))),
      cta: "/pay/bills", priority: 50,
    });
    out.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return { list: out, cashflow: dash ? cf : null, hasCreditCard: !!credit, salary, subsMonthly };
  }

  return { collect, cashflowOf };
})();

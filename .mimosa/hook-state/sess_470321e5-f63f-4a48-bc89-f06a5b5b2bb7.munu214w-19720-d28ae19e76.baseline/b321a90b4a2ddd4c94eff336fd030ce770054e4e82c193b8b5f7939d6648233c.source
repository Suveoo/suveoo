/* genui/renderer.js — Verified GenUI 渲染器（issuer==="verified_ir" 才渲染） */
S.genui = {
  render(card) {
    if (!card || card.issuer !== "verified_ir") {
      // 非 Verified 来源的卡片数据一律丢弃（LLM 不能自造金额）
      if (card && card.component) console.warn("[genui] dropped non-verified card", card.component);
      return null;
    }
    const fn = S.genuiCards[card.component] ?? S.genuiCards.fallback;
    /* 必须 .call(S.genuiCards, …)：卡片方法内部用 this.confirmMeta/this.kv 取元数据，
       裸调用 fn(card) 会丢 this（AI 通道确认卡曾因此整链抛错 → 被 SSE catch 吞成 onError） */
    return S.ui.el(fn.call(S.genuiCards, card));
  },
};

/* genui/renderer.js — Verified GenUI 渲染器（issuer==="verified_ir" 才渲染） */
S.genui = {
  render(card) {
    if (!card || card.issuer !== "verified_ir") {
      // 非 Verified 来源的卡片数据一律丢弃（LLM 不能自造金额）
      if (card && card.component) console.warn("[genui] dropped non-verified card", card.component);
      return null;
    }
    const fn = S.genuiCards[card.component] ?? S.genuiCards.fallback;
    return S.ui.el(fn(card));
  },
};

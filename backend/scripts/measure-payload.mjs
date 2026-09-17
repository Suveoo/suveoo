// measure-payload.mjs — 量化每次 LLM 请求体的构成（系统提示词 / 工具 desc / 工具 schema）
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../worker-main.js", import.meta.url), "utf-8");
const sys = src.match(/const AI_SYSTEM_PROMPT = `([\s\S]*?)`;/)[1];
console.log("AI_SYSTEM_PROMPT chars:", sys.length);

const seg = src.match(/const MCP_TOOLS = \[([\s\S]*?)\n\];/)[1];
const entries = [...seg.matchAll(/\{ name: "([a-z_]+)", desc: "((?:[^"\\]|\\.)*)", args: (\{.*?\}) \}/g)];
const rows = entries.map((e) => ({ name: e[1], descLen: e[2].length, argsLen: e[3].length }));
const total = rows.reduce((a, r) => a + r.descLen + r.argsLen, 0);
rows.sort((a, b) => (b.descLen + b.argsLen) - (a.descLen + a.argsLen));
console.log("tools:", rows.length, "| total desc+args chars:", total);
console.log("top10 by size:");
for (const r of rows.slice(0, 10)) console.log(`  ${r.name}: desc=${r.descLen} args=${r.argsLen} sum=${r.descLen + r.argsLen}`);
console.log("per-round fixed payload (system+tools):", sys.length + total, "chars ≈", Math.round((sys.length + total) / 1024) + "KB");

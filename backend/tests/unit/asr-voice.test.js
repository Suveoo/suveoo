import { describe, expect, it } from "vitest";
import { aliPercentEncode, aliPopSignatureAsync, nlsTokenParams, nlsWsDirective } from "../../worker-main.js";

/** 第四十一轮：语音 ASR 代理纯函数——签名用阿里云官方离线测试向量锁定（文档《通过OpenAPI获取Token》示例）。 */
describe("ASR 语音代理（阿里云 NLS）", () => {
  it("percentEncode：POP 风格 RFC3986（空格 %20、冒号 %3A、斜杠 %2F）", () => {
    expect(aliPercentEncode(" ")).toBe("%20");
    expect(aliPercentEncode("/")).toBe("%2F");
    expect(aliPercentEncode("2019-04-18T08:32:31Z")).toBe("2019-04-18T08%3A32%3A31Z");
    expect(aliPercentEncode("a~b-c_d.e*f")).toBe("a~b-c_d.e%2Af");
  });

  it("POP V1.0 HMAC-SHA1 签名＝官方离线向量（b924c8c3 → hHq4yNsPitlfDJ2L0nQPdugdEzM=）", async () => {
    const params = {
      AccessKeyId: "my_access_key_id", Action: "CreateToken", Format: "JSON", RegionId: "cn-shanghai",
      SignatureMethod: "HMAC-SHA1", SignatureNonce: "b924c8c3-6d03-4c5d-ad36-d984d3116788",
      SignatureVersion: "1.0", Timestamp: "2019-04-18T08:32:31Z", Version: "2019-02-28",
    };
    const sig = await aliPopSignatureAsync("my_access_key_secret", "GET", params);
    expect(sig).toBe("hHq4yNsPitlfDJ2L0nQPdugdEzM=");
  });

  it("nlsTokenParams：公共参数齐备（CreateToken/2019-02-28/cn-shanghai）", () => {
    const p = nlsTokenParams("AKID", "nonce-1", "2026-09-30T10:00:00Z");
    expect(p.Action).toBe("CreateToken");
    expect(p.Version).toBe("2019-02-28");
    expect(p.RegionId).toBe("cn-shanghai");
    expect(p.SignatureMethod).toBe("HMAC-SHA1");
    expect(p.AccessKeyId).toBe("AKID");
    expect(p.SignatureNonce).toBe("nonce-1");
    expect(Object.keys(p)).not.toContain("Signature");
  });

  it("nlsWsDirective：StartTranscription（带 payload）与 StopTranscription（无 payload）结构", () => {
    const start = JSON.parse(nlsWsDirective("StartTranscription", "appk", "task1", "msg1", { format: "pcm", sample_rate: 16000, enable_intermediate_result: true, enable_punctuation_prediction: true, enable_inverse_text_normalization: true, max_sentence_silence: 800 }));
    expect(start.header.namespace).toBe("SpeechTranscriber");
    expect(start.header.name).toBe("StartTranscription");
    expect(start.header.appkey).toBe("appk");
    expect(start.header.task_id).toBe("task1");
    expect(start.header.message_id).toBe("msg1");
    expect(start.payload.sample_rate).toBe(16000);
    const stop = JSON.parse(nlsWsDirective("StopTranscription", "appk", "task1", "msg2"));
    expect(stop.header.name).toBe("StopTranscription");
    expect(stop.payload).toBeUndefined();
    expect(stop.header.task_id).toBe("task1"); /* 与 Start 同 task（阿里协议要求） */
  });
});

/* 一次性探测：阿里云短信认证的赠送签名/模板（DescribeVerifyScheme）——本地跑，输出供 SMS_SIGN_NAME/SMS_TEMPLATE_CODE */
import { createHmac } from "node:crypto";
const KEY_ID = process.env.ALI_KEY_ID, SECRET = process.env.ALI_SECRET;
const params = {
  Action: "SendSmsVerifyCode", Version: "2017-05-25", Format: "JSON",
  AccessKeyId: KEY_ID, SignatureMethod: "HMAC-SHA1", SignatureVersion: "1.0",
  SignatureNonce: crypto.randomUUID(), Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  RegionId: "cn-hangzhou", CountryCode: "86", PhoneNumber: "17724746393", CodeLength: "6", CodeType: "1", TemplateParam: JSON.stringify({ code: "864210", min: "5" }), ReturnVerifyCode: "true",
};
const qs = Object.keys(params).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
params.Signature = createHmac("sha1", SECRET + "&").update("POST&%2F&" + encodeURIComponent(qs)).digest("base64");
const res = await fetch("https://dypnsapi.aliyuncs.com/", {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
  body: Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&"),
});
console.log(res.status, JSON.stringify(await res.json(), null, 2));

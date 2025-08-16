import type { Handler } from "@netlify/functions";

export const handler: Handler = async () => {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  // 1) 環境變數是否存在
  if (!raw) {
    return { statusCode: 200, body: JSON.stringify({ envLoaded: false, reason: "ENV missing" }) };
  }

  // 2) 是否能 parse 成 JSON
  let creds: any;
  try {
    creds = JSON.parse(raw);
  } catch {
    return { statusCode: 200, body: JSON.stringify({ envLoaded: true, jsonValid: false }) };
  }

  // 3) 是否包含 client_email / private_key（不印秘鑰）
  const hasEmail = typeof creds.client_email === "string" && creds.client_email.includes("@");
  const hasPrivateKey = typeof creds.private_key === "string" && creds.private_key.length > 0;

  // 4) private_key 看看是否像一把 key（只做 pattern 檢查）
  const containsBegin = hasPrivateKey &&
    (creds.private_key.includes("BEGIN PRIVATE KEY") || creds.private_key.includes("BEGIN RSA PRIVATE KEY"));

  const preview = hasPrivateKey ? creds.private_key.slice(0, 30) : "";

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      envLoaded: true,
      jsonValid: true,
      keys: Object.keys(creds),
      hasClientEmail: hasEmail,
      hasPrivateKey,
      privateKeyContainsHeader: containsBegin,
      privateKeyPreview: preview, // 只是一點點頭，方便你確認樣子
    }, null, 2),
  };
};

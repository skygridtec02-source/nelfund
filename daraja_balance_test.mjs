import fs from "fs";
import path from "path";
const env = Object.fromEntries(
  fs.readFileSync(path.join(process.cwd(), ".env"), "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (!m) return null;
      return [m[1], m[2].replace(/^"|"$/g, "")];
    })
    .filter(Boolean),
);
const base = env.MPESA_ENV === "sandbox" ? "https://sandbox.safaricom.co.ke" : "https://api.safaricom.co.ke";
const auth = Buffer.from(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`).toString("base64");
console.log("base", base);
const authRes = await fetch(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
  headers: { Authorization: `Basic ${auth}` },
});
console.log("auth status", authRes.status);
const authText = await authRes.text();
console.log("auth body", authText);
if (!authRes.ok) process.exit(1);
const token = JSON.parse(authText).access_token;
const url = `${base}/mpesa/accountbalance/v1/query`;
const body = {
  Initiator: env.MPESA_INITIATOR_NAME,
  SecurityCredential: env.MPESA_SECURITY_CREDENTIAL,
  CommandID: "AccountBalance",
  PartyA: env.MPESA_SHORTCODE,
  IdentifierType: 4,
  Remarks: "Nel Funds balance lookup",
  QueueTimeOutURL: "https://localhost/api/public/mpesa/timeout",
  ResultURL: "https://localhost/api/public/mpesa/result",
};
console.log('POST', url, JSON.stringify(body, null, 2));
const res = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
console.log('status', res.status, res.statusText);
const text = await res.text();
console.log('body', text);

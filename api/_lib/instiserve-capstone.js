import { createHmac, createHash, randomUUID } from "node:crypto";

export function signPayload(secret, timestamp, rawBody) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function snapshotHash(snapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export async function deliverCapstone(event, { fetchImpl = fetch } = {}) {
  const url = process.env.INSTISERVE_CAPSTONE_WEBHOOK_URL;
  const secret = process.env.ARKHIMAR_INSTISERVE_WEBHOOK_SECRET;
  if (!url || !secret) throw new Error("InstiServe capstone integration is not configured");
  const rawBody = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": randomUUID(),
      "x-arkhimar-timestamp": timestamp,
      "x-arkhimar-signature": `sha256=${signPayload(secret, timestamp, rawBody)}`,
    },
    body: rawBody,
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || `InstiServe returned ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return result;
}

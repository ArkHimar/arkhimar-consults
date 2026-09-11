import { supabase } from "./backend.js";

const EVENT_KEY_PREFIX = "arkhimar:instiserve:capstone:";

export async function submitCapstoneToInstiServe({ project, snapshot, matricNo, exports = [] }) {
  if (!project?.id) throw new Error("Select a project before submitting");
  if (!supabase) throw new Error("Sign in to submit your capstone");
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Your session has expired. Sign in again.");

  const storageKey = EVENT_KEY_PREFIX + project.id;
  const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
  const revision = Number(saved.revision || 0) + 1;
  const eventId = crypto.randomUUID();
  const response = await fetch("/api/v1/integrations/instiserve/capstone-submit", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      eventId, projectId: project.id, matricNo, revision, snapshot, exports,
      summary: {
        readiness: project.readiness || null,
        status: project.status || null,
        submittedFrom: "ArkHimar PM",
      },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "InstiServe submission failed");
  localStorage.setItem(storageKey, JSON.stringify({ eventId, revision, submittedAt: new Date().toISOString() }));
  return result;
}

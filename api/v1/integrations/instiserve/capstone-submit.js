import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { deliverCapstone, snapshotHash } from "../../../../_lib/instiserve-capstone.js";

const json = (res, status, body) => res.status(status).json(body);

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return json(res, 401, { error: "Authentication required" });

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return json(res, 503, { error: "ArkHimar backend is not configured" });

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: authData, error: authError } = await userClient.auth.getUser(auth.slice(7));
  if (authError || !authData.user) return json(res, 401, { error: "Invalid session" });

  const input = req.body || {};
  if (!input.projectId || !input.revision || !input.snapshot) return json(res, 400, { error: "projectId, revision and snapshot are required" });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: project } = await admin.from("projects").select("id,workspace_id,code,title").eq("id", input.projectId).maybeSingle();
  if (!project) return json(res, 404, { error: "Project not found" });
  const { data: membership } = await admin.from("workspace_members").select("id").eq("workspace_id", project.workspace_id).eq("user_id", authData.user.id).maybeSingle();
  if (!membership) return json(res, 403, { error: "You cannot submit this project" });

  const submittedAt = new Date().toISOString();
  const event = {
    eventId: input.eventId || randomUUID(),
    eventType: "capstone.submitted.v1",
    occurredAt: submittedAt,
    institutionCode: process.env.INSTISERVE_INSTITUTION_CODE || "TBSC",
    courseCode: process.env.INSTISERVE_CAPSTONE_COURSE_CODE || "PJM 499",
    assignmentTitle: process.env.INSTISERVE_CAPSTONE_ASSIGNMENT_TITLE || "Integrated Capstone Project",
    submission: {
      studentEmail: authData.user.email,
      matricNo: input.matricNo || null,
      projectId: project.id,
      projectCode: project.code || null,
      projectTitle: project.title,
      projectUrl: `${process.env.ARKHIMAR_PUBLIC_URL || "https://arkhimar.com"}/pm/?project=${project.id}`,
      submittedAt,
      revision: Number(input.revision),
      snapshotHash: snapshotHash(input.snapshot),
      summary: input.summary || {},
      exports: Array.isArray(input.exports) ? input.exports.slice(0, 25) : [],
    },
  };
  try {
    const receipt = await deliverCapstone(event);
    return json(res, 200, { submitted: true, eventId: event.eventId, receipt });
  } catch (error) {
    console.error("InstiServe capstone delivery failed", { eventId: event.eventId, message: error.message });
    return json(res, error.status >= 400 && error.status < 500 ? error.status : 502, { submitted: false, eventId: event.eventId, error: error.message });
  }
}

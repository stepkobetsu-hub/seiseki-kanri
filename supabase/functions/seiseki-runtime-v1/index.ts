import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const COMMON_API_URL = "https://script.google.com/macros/s/AKfycbwu8lfhiH3_7m4ogHNtbgeo3ehx_VBMnt1mPXsvIlL_kMSpxFdrRD4rO_I6q_JUXIWHmg/exec";
const GRADE_GAS_URL = "https://script.google.com/macros/s/AKfycbypkUc0MqZ07E7pZRglNPeRM56WbCcuWaLpRzi9bVFcPklHDxaaLC7GfzG6ozTGCbEX/exec";
const db = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const cors = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,authorization",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const msg = (e: unknown) => e instanceof Error ? e.message : String(e);
const clean = (v: unknown) => String(v ?? "").trim();
const numOrNull = (v: unknown) => v === "" || v === null || v === undefined ? null : Number(v);
const intOrNull = (v: unknown) => v === "" || v === null || v === undefined ? null : Math.trunc(Number(v));

function parseResults(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch (_) { return {}; }
  }
  return {};
}

function splitWishPayload(source: Record<string, unknown>) {
  const wishes: Record<string, unknown> = { ...source };
  delete wishes.action; delete wishes.token; delete wishes.studentId; delete wishes.mutationId;
  delete wishes.name; delete wishes.campus; delete wishes.grade; delete wishes.school; delete wishes.updatedAt;
  const results = parseResults(wishes.results);
  delete wishes.results;
  return { wishes, results };
}

async function hash(raw: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function background(p: Promise<unknown>) { EdgeRuntime.waitUntil(p.catch(e => console.error("seiseki background", msg(e)))); }
async function postJson(url: string, body: Record<string, unknown>, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), signal: controller.signal });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || out?.success === false || out?.ok === false) throw new Error(out?.error || out?.message || `HTTP ${r.status}`);
    return out;
  } finally { clearTimeout(timer); }
}

async function verifyCommonStudentSession(token: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(COMMON_API_URL, {
      method:"POST",headers:{"content-type":"text/plain;charset=utf-8"},
      body:JSON.stringify({action:"getCommonStudentSession",token}),signal:controller.signal,redirect:"follow",
    });
    if (!response.ok) throw new Error("AUTH_UNAVAILABLE");
    return await response.json();
  } finally { clearTimeout(timeout); }
}

async function validateStudent(token: string) {
  if (!token) throw new Error("AUTH_REQUIRED");
  const tokenHash = await hash(token);
  const now = new Date().toISOString();
  const { data, error } = await db.from("foresta_v3_sessions").select("profile,expires_at").eq("token_hash", tokenHash).gt("expires_at", now).maybeSingle();
  if (error) throw error;

  let profile: Record<string, unknown> | null = data ? ((data.profile?.session || data.profile) as Record<string, unknown>) : null;
  if (!profile) {
    let verified: Record<string, unknown>;
    try {
      verified = await verifyCommonStudentSession(token);
    } catch (_) {
      throw new Error("AUTH_UNAVAILABLE");
    }
    if (verified.success !== true || clean(verified.role).toUpperCase() !== "STUDENT" || !verified.profile || typeof verified.profile !== "object" || Array.isArray(verified.profile)) {
      throw new Error("AUTH_REQUIRED");
    }
    profile = verified.profile as Record<string, unknown>;

    const studentIdForCache = clean(profile.studentId || profile.loginId || profile.userId || profile.id);
    if (!studentIdForCache) throw new Error("AUTH_REQUIRED");
    const expiresAt = clean(profile.expiresAt || verified.expiresAt) || new Date(Date.now() + 8 * 3600e3).toISOString();
    const roleForCache = clean(profile.role || profile.userType || verified.role || "student").toLowerCase();
    const cachedProfile = { ...profile, role: roleForCache, studentId: studentIdForCache, expiresAt };
    const { error: cacheError } = await db.from("foresta_v3_sessions").upsert({
      token_hash: tokenHash,
      user_id: studentIdForCache,
      role: roleForCache,
      profile: cachedProfile,
      expires_at: expiresAt,
      last_seen_at: now,
      validated_at: now,
    }, { onConflict: "token_hash" });
    if (cacheError) console.error("seiseki session cache", cacheError.message);
    profile = cachedProfile;
  }

  const role = clean(profile.role || profile.userType || "student").toLowerCase();
  const studentId = clean(profile.studentId || profile.loginId || profile.userId || profile.id);
  if (!studentId) throw new Error("AUTH_REQUIRED");
  if (!["student", "生徒"].includes(role)) throw new Error("FORBIDDEN");
  return {
    studentId,
    name: clean(profile.name),
    campus: clean(profile.campus),
    grade: clean(profile.grade),
    school: clean(profile.school || profile.schoolName),
  };
}

async function ensureStudent(p: {studentId:string,name:string,campus:string,grade:string,school:string}) {
  const { data, error } = await db.from("students").upsert({
    student_code: p.studentId, name: p.name || p.studentId, campus: p.campus || null,
    grade: p.grade || null, school_name: p.school || null, active: true, source_updated_at: new Date().toISOString(),
  }, { onConflict: "student_code" }).select("id,student_code,name,campus,grade,school_name").single();
  if (error) throw error;
  return data;
}

async function seeded(studentCode: string, entity: string) {
  const { data, error } = await db.from("seiseki_seed_state").select("seeded_at").eq("student_code", studentCode).eq("entity", entity).maybeSingle();
  if (error) throw error;
  return !!data;
}
async function markSeeded(studentCode: string, entity: string) {
  const { error } = await db.from("seiseki_seed_state").upsert({ student_code: studentCode, entity, seeded_at: new Date().toISOString() }, { onConflict: "student_code,entity" });
  if (error) throw error;
}

function scoreDb(s: Record<string, unknown>, studentId: string) {
  return {
    student_id: studentId, school_year: Number(s.year), test_number: Number(s.term),
    japanese: numOrNull(s.jpn), social: numOrNull(s.soc), math: numOrNull(s.math), science: numOrNull(s.sci), english: numOrNull(s.eng),
    music: numOrNull(s.mus), art: numOrNull(s.art), health_pe: numOrNull(s.pe), technology_home: numOrNull(s.tech),
    total_5: numOrNull(s.total5), total_9: numOrNull(s.total9), rank_5: intOrNull(s.rank5), rank_9: intOrNull(s.rank9),
    avg_japanese: numOrNull(s.avg_jpn), avg_social: numOrNull(s.avg_soc), avg_math: numOrNull(s.avg_math), avg_science: numOrNull(s.avg_sci), avg_english: numOrNull(s.avg_eng), avg_total_5: numOrNull(s.avg_total5),
  };
}
function scoreApi(r: Record<string, unknown>) {
  return {
    year: r.school_year, term: r.test_number, jpn: r.japanese ?? "", soc: r.social ?? "", math: r.math ?? "", sci: r.science ?? "", eng: r.english ?? "",
    mus: r.music ?? "", art: r.art ?? "", pe: r.health_pe ?? "", tech: r.technology_home ?? "", total5: r.total_5 ?? "", total9: r.total_9 ?? "", rank5: r.rank_5 ?? "", rank9: r.rank_9 ?? "",
    avg_jpn: r.avg_japanese ?? "", avg_soc: r.avg_social ?? "", avg_math: r.avg_math ?? "", avg_sci: r.avg_science ?? "", avg_eng: r.avg_english ?? "", avg_total5: r.avg_total_5 ?? "",
  };
}
function reportDb(s: Record<string, unknown>, studentId: string) {
  return {
    student_id: studentId, school_year: Number(s.year), term: clean(s.semester || s.term),
    japanese: intOrNull(s.rp_jpn), social: intOrNull(s.rp_soc), math: intOrNull(s.rp_math), science: intOrNull(s.rp_sci), english: intOrNull(s.rp_eng),
    music: intOrNull(s.rp_mus), art: intOrNull(s.rp_art), health_pe: intOrNull(s.rp_pe), technology_home: intOrNull(s.rp_tech),
  };
}
function reportApi(r: Record<string, unknown>) {
  return { year:r.school_year, semester:r.term, rp_jpn:r.japanese??"", rp_soc:r.social??"", rp_math:r.math??"", rp_sci:r.science??"", rp_eng:r.english??"", rp_mus:r.music??"", rp_art:r.art??"", rp_pe:r.health_pe??"", rp_tech:r.technology_home??"" };
}

async function seedScores(profile: any, student: any) {
  if (await seeded(profile.studentId, "scores")) return;
  const gas = await postJson(GRADE_GAS_URL, { action: "getStudentScores", studentId: profile.studentId }, 12000);
  const rows = Array.isArray(gas.scores) ? gas.scores : [];
  if (rows.length) {
    const { error } = await db.from("test_scores").upsert(rows.map((s: any) => scoreDb(s, student.id)), { onConflict: "student_id,school_year,test_number", ignoreDuplicates: true });
    if (error) throw error;
  }
  await markSeeded(profile.studentId, "scores");
}
async function seedReports(profile: any, student: any) {
  if (await seeded(profile.studentId, "reports")) return;
  const gas = await postJson(GRADE_GAS_URL, { action: "getReports", studentId: profile.studentId }, 12000);
  const rows = Array.isArray(gas.data) ? gas.data : Array.isArray(gas.reports) ? gas.reports : [];
  if (rows.length) {
    const { error } = await db.from("report_cards").upsert(rows.map((s: any) => reportDb(s, student.id)), { onConflict: "student_id,school_year,term" });
    if (error) throw error;
  }
  await markSeeded(profile.studentId, "reports");
}
async function seedWish(profile: any, student: any) {
  if (await seeded(profile.studentId, "wish")) return;
  const gas = await postJson(GRADE_GAS_URL, { action: "getWish", studentId: profile.studentId }, 12000);
  if (gas.wish && Object.keys(gas.wish).length) {
    const { wishes, results } = splitWishPayload(gas.wish as Record<string, unknown>);
    const { error } = await db.from("school_preferences").upsert({ student_id: student.id, school_year: 0, wishes, results }, { onConflict: "student_id,school_year" });
    if (error) throw error;
  }
  await markSeeded(profile.studentId, "wish");
}

async function enqueue(action: string, studentCode: string, payload: Record<string, unknown>) {
  const mutationId = clean(payload.mutationId) || crypto.randomUUID();
  const mirrorPayload = { ...payload };
  delete mirrorPayload.token; delete mirrorPayload.mutationId;
  const { error } = await db.from("seiseki_mutations").upsert({ mutation_id: mutationId, action, student_code: studentCode, payload: mirrorPayload, status: "accepted", updated_at: new Date().toISOString() }, { onConflict: "mutation_id", ignoreDuplicates: true });
  if (error) throw error;
  background(processMutation(mutationId));
  return mutationId;
}
async function processMutation(mutationId: string) {
  const { data: row, error } = await db.from("seiseki_mutations").select("*").eq("mutation_id", mutationId).maybeSingle();
  if (error || !row || row.status === "mirrored") return;
  if (row.next_attempt_at && new Date(row.next_attempt_at) > new Date()) return;
  await db.from("seiseki_mutations").update({ status:"mirroring", attempts:Number(row.attempts||0)+1, updated_at:new Date().toISOString() }).eq("mutation_id", mutationId);
  try {
    await postJson(GRADE_GAS_URL, { ...row.payload, action: row.action, studentId: row.student_code }, 15000);
    await db.from("seiseki_mutations").update({ status:"mirrored", mirrored_at:new Date().toISOString(), next_attempt_at:null, last_error:null, updated_at:new Date().toISOString() }).eq("mutation_id", mutationId);
  } catch (e) {
    const delay = Math.min(1800, 20 * 2 ** Math.min(Number(row.attempts || 0), 6));
    await db.from("seiseki_mutations").update({ status:"failed", next_attempt_at:new Date(Date.now()+delay*1000).toISOString(), last_error:msg(e).slice(0,1000), updated_at:new Date().toISOString() }).eq("mutation_id", mutationId);
  }
}
async function processRetryQueue() {
  const now = new Date().toISOString();
  const { data } = await db.from("seiseki_mutations").select("mutation_id").in("status", ["accepted","failed"]).or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`).order("created_at").limit(5);
  for (const r of data || []) await processMutation(r.mutation_id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    const body = await req.json() as Record<string, unknown>;
    const profile = await validateStudent(clean(body.token));
    const requestedStudent = clean(body.studentId || profile.studentId);
    if (requestedStudent !== profile.studentId) throw new Error("FORBIDDEN");
    const student = await ensureStudent(profile);
    const action = clean(body.action);
    background(processRetryQueue());

    if (action === "getStudentScores") {
      await seedScores(profile, student);
      const { data, error } = await db.from("test_scores").select("*").eq("student_id", student.id).order("school_year").order("test_number");
      if (error) throw error;
      return json({ success:true, scores:(data||[]).map(scoreApi), source:"supabase" });
    }
    if (action === "saveScore") {
      const fields = ["jpn","soc","math","sci","eng","mus","art","pe","tech","rank5","rank9","avg_jpn","avg_soc","avg_math","avg_sci","avg_eng","avg_total5"];
      if (!fields.some(k => body[k] !== "" && body[k] !== null && body[k] !== undefined)) return json({success:false, code:"EMPTY_SCORE", error:"全欄空白の保存はできません。削除は履歴の削除ボタンから行ってください。"}, 400);
      const { error } = await db.from("test_scores").upsert(scoreDb(body, student.id), { onConflict:"student_id,school_year,test_number" });
      if (error) throw error;
      const mutationId = await enqueue(action, profile.studentId, body);
      return json({ success:true, message:"自動保存しました", mutationId, source:"supabase" });
    }
    if (action === "deleteScore") {
      const { error } = await db.from("test_scores").delete().eq("student_id", student.id).eq("school_year", Number(body.year)).eq("test_number", Number(body.term));
      if (error) throw error;
      const mutationId = await enqueue(action, profile.studentId, body);
      return json({ success:true, mutationId, source:"supabase" });
    }
    if (action === "getReports") {
      await seedReports(profile, student);
      const { data, error } = await db.from("report_cards").select("*").eq("student_id", student.id).order("school_year").order("term");
      if (error) throw error;
      return json({ success:true, data:(data||[]).map(reportApi), reports:(data||[]).map(reportApi), source:"supabase" });
    }
    if (action === "getReport") {
      await seedReports(profile, student);
      const { data, error } = await db.from("report_cards").select("*").eq("student_id", student.id).eq("school_year", Number(body.year)).eq("term", clean(body.semester || body.term)).maybeSingle();
      if (error) throw error;
      return json({ success:true, data:data ? reportApi(data) : {}, report:data ? reportApi(data) : null, source:"supabase" });
    }
    if (action === "saveReport") {
      const { error } = await db.from("report_cards").upsert(reportDb(body, student.id), { onConflict:"student_id,school_year,term" });
      if (error) throw error;
      const mutationId = await enqueue(action, profile.studentId, body);
      return json({ success:true, message:"自動保存しました", mutationId, source:"supabase" });
    }
    if (action === "deleteReport") {
      const { error } = await db.from("report_cards").delete().eq("student_id", student.id).eq("school_year", Number(body.year)).eq("term", clean(body.semester || body.term));
      if (error) throw error;
      const mutationId = await enqueue(action, profile.studentId, body);
      return json({ success:true, mutationId, source:"supabase" });
    }
    if (action === "getWish") {
      await seedWish(profile, student);
      const { data, error } = await db.from("school_preferences").select("wishes,results,updated_at").eq("student_id", student.id).eq("school_year", 0).maybeSingle();
      if (error) throw error;
      if (!data) return json({ success:true, wish:null, source:"supabase" });
      const wishes: Record<string, unknown> = { ...(data.wishes || {}) };
      const embeddedResults = parseResults(wishes.results);
      delete wishes.results;
      const storedResults = parseResults(data.results);
      const results = Object.keys(storedResults).length ? storedResults : embeddedResults;
      return json({ success:true, wish:{ ...wishes, results, updatedAt:data.updated_at }, source:"supabase" });
    }
    if (action === "saveWish") {
      const { wishes, results } = splitWishPayload(body);
      const { error } = await db.from("school_preferences").upsert({ student_id:student.id, school_year:0, wishes, results }, { onConflict:"student_id,school_year" });
      if (error) throw error;
      const mutationId = await enqueue(action, profile.studentId, body);
      return json({ success:true, message:"自動保存しました", mutationId, source:"supabase" });
    }
    throw new Error("INVALID_ACTION");
  } catch (e) {
    const m = msg(e);
    console.error("seiseki request failed", m);
    const status = m === "AUTH_UNAVAILABLE" ? 503 : m === "AUTH_REQUIRED" ? 401 : m === "FORBIDDEN" ? 403 : m === "INVALID_ACTION" ? 400 : 500;
    return json({ success:false, error:m }, status);
  }
});

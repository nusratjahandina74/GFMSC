#!/usr/bin/env node
// Project-memory CLI. The *.md files at repo root are GENERATED from tools/registry.json.
//   node tools/mem.mjs bug <ID> <Open|Fixed|Partial|Blocked|WontFix> "<fix>" "<test>" ["<root cause>"]
//   node tools/mem.mjs task <ID> <" "|~|x|!> ["note"]
//   node tools/mem.mjs sub <ID> <" "|~|x|!> ["note"]        (sub-task, e.g. T03.2)
//   node tools/mem.mjs decision "<title>" "<text>"
//   node tools/mem.mjs log "<changelog line>"
//   node tools/mem.mjs tests "<suite>" <total> <passed> <failed> <skipped>
//   node tools/mem.mjs state key "value"                    (PROJECT_STATUS fields)
//   node tools/mem.mjs render
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const regPath = path.join(here, "registry.json");
const R = JSON.parse(fs.readFileSync(regPath, "utf8"));

const T = (id, phase, title, subs = []) => ({ id, phase, title, mark: " ", note: "", subs: subs.map((s, i) => ({ id: `${id}.${i + 1}`, title: s, mark: " ", note: "" })) });
if (!R.tasks.length) {
  R.tasks = [
    T("T01","Setup","Repository audit (no code change)",["Backend architecture","Frontend architecture","Models/routes/controllers","Auth + tenant + payment flows","Known bugs register"]),
    T("T02","Setup","Safe development setup (git, .gitignore, secrets, build, tests)",["Git baseline commit","Verify .gitignore & untracked .env","Backend startup","Frontend build","Test runner + integration DB"]),
    T("T03","Phase 0 Security","Multi-tenant isolation (central tenant context)",["Central tenant helper + middleware","Strip body/query/params schoolId for non-superAdmin","Fix every client-schoolId controller (C07-C09,H04-H08)","Scope all by-id queries (find/update/delete)","Cross-school regression tests"]),
    T("T04","Phase 0 Security","Authentication hardening",["Remove JWT fallback secrets; fail startup","DB role authoritative (no stale role)","Session store + refresh rotation + reuse detection + logout","Close public SuperAdmin endpoint (C01)","Password policy + remove default 123456","Login brute-force protection","Tokens: move off localStorage (H28)"]),
    T("T05","Phase 0 Security","RBAC + permission system",["Permission catalog + role map","requirePermission middleware","Ownership checks","Tests"]),
    T("T06","Phase 0 Security","Payment security (C02-C05,H15,H16,M08)",["Server-authoritative amount from Invoice","Gateway server-to-server verification (SSLCommerz validate, bKash execute)","Idempotent success handling","Tenant scoping of invoice/payment reads","Disable demo gateway in production","Idempotency-Key on initiate","Frontend callback routes"]),
    T("T07","Phase 1 Integrity","Finance integrity (H05,H14,C06)",["Invoice unique index","payFee <-> Invoice sync","Transactions everywhere (withTransaction helper)","Ledger groundwork"]),
    T("T08","Phase 1 Integrity","Academic data integrity (canonical Exam->Mark->Result)",[]),
    T("T09","Phase 1 Integrity","Attendance integrity (C10,H10)",["Validate student belongs to school/class/section","Fix CSV export for nested records"]),
    T("T10","Phase 1 Integrity","Admission (H11) race-safe roll + unique index + full workflow",[]),
    T("T11","Phase 2 Bugs","Landing page (H17,H18,H24) tenant + role + whitelist",[]),
    T("T12","Phase 1 Integrity","Library (H09) atomic issue + borrower validation + extended features",[]),
    T("T13","Phase 4 ERP","HR + Payroll",[]),
    T("T14","Phase 4 ERP","Transport + Hostel",[]),
    T("T15","Phase 4 ERP","Online exams + Assignments",[]),
    T("T16","Phase 4 ERP","Communication / messaging",[]),
    T("T17","Phase 4 ERP","Inventory + Procurement",[]),
    T("T18","Phase 4 ERP","SaaS subscription / billing",[]),
    T("T19","Phase 3 Arch","Audit logging (M03)",[]),
    T("T20","Phase 3 Arch","API hardening: validation (M04,M05), /api/v1, pagination, error shape (H27), regex (M06)",[]),
    T("T21","Phase 0 Security","Security hardening: helmet/CSP (M01), health (H25,H26), request-id (M02)",[]),
    T("T22","Phase 2 Bugs","Frontend production hardening (Select value, My Leaves H21, analytics H20, error handling)",["Radix SelectItem value=\"\" crash (E06)","H21 My Leaves route","H20 analytics path"]),
    T("T23","Testing","Automated testing (unit/integration/security/E2E)",[]),
    T("T24","Phase 5 DevOps","Docker, CI/CD, env separation",[]),
    T("T25","Phase 5 DevOps","Redis + queues (H29,H30)",[]),
    T("T26","Phase 5 DevOps","Database optimization / indexes / M07 timezone",[]),
    T("T27","Final","Final production audit (Definition of Done, 25 gates)",[]),
  ];
}
const save = () => fs.writeFileSync(regPath, JSON.stringify(R, null, 1));
const now = () => new Date().toISOString().slice(0, 10);
const [cmd, ...a] = process.argv.slice(2);
const findTask = (id) => { const [p] = id.split("."); const t = R.tasks.find((x) => x.id === p); if (!t) throw new Error("no task " + id); return id.includes(".") ? t.subs.find((s) => s.id === id) : t; };

if (cmd === "bug") { const b = R.bugs.find((x) => x.id === a[0]); if (!b) throw new Error("no bug " + a[0]); b.status = a[1]; if (a[2]) b.fix = a[2]; if (a[3]) b.test = a[3]; if (a[4]) b.root = a[4]; }
else if (cmd === "task" || cmd === "sub") { const t = findTask(a[0]); t.mark = a[1]; if (a[2] !== undefined) t.note = a[2]; }
else if (cmd === "decision") R.decisions.push({ date: now(), title: a[0], text: a[1] });
else if (cmd === "log") R.changelog.push({ date: now(), text: a[0] });
else if (cmd === "tests") { const [suite, total, passed, failed, skipped] = a; R.tests.suites = R.tests.suites.filter((s) => s.suite !== suite); R.tests.suites.push({ suite, total: +total, passed: +passed, failed: +failed, skipped: +skipped }); R.tests.total = R.tests.suites.reduce((n, s) => n + s.total, 0); R.tests.passed = R.tests.suites.reduce((n, s) => n + s.passed, 0); R.tests.failed = R.tests.suites.reduce((n, s) => n + s.failed, 0); R.tests.skipped = R.tests.suites.reduce((n, s) => n + s.skipped, 0); }
else if (cmd === "state") R.status[a[0]] = a[1];
else if (cmd !== "render") { console.error("unknown cmd"); process.exit(1); }
save();

// ---------- render ----------
const w = (f, s) => fs.writeFileSync(path.join(root, f), s.trim() + "\n");
const mk = (m) => ({ " ": "[ ]", "~": "[~]", x: "[x]", "!": "[!]" }[m] ?? "[ ]");
const cnt = (arr, f) => arr.filter(f).length;
const open = R.bugs.filter((b) => b.status === "Open" || b.status === "Partial" || b.status === "Blocked");
const sevOrder = { Critical: 0, High: 1, Medium: 2, Low: 3 };

w("TASK_CHECKLIST.md", `# TASK_CHECKLIST — master roadmap (from SMS.pdf, 27 steps)
> GENERATED by \`node tools/mem.mjs render\` from tools/registry.json. Do not hand-edit.
> Legend: [ ] Not Started · [~] In Progress · [x] Completed · [!] Blocked. Completed tasks are never deleted.

` + R.tasks.map((t) => `## ${mk(t.mark)} ${t.id} — ${t.title}  _(${t.phase})_${t.note ? `\n> ${t.note}` : ""}\n` + t.subs.map((s) => `- ${mk(s.mark)} ${s.id} ${s.title}${s.note ? ` — ${s.note}` : ""}`).join("\n")).join("\n\n"));

const bugRows = [...R.bugs].sort((x, y) => sevOrder[x.sev] - sevOrder[y.sev] || x.id.localeCompare(y.id));
w("BUG_REGISTER.md", `# BUG_REGISTER
> GENERATED from tools/registry.json (\`node tools/mem.mjs bug <ID> <status> "<fix>" "<test>"\`).

Total: ${R.bugs.length} · Open/Partial/Blocked: ${open.length} · Fixed: ${cnt(R.bugs, (b) => b.status === "Fixed")}
(Note: SMS.pdf says "38 bugs" but actually lists 48: 10 Critical + 30 High + 8 Medium. E* rows come from earlier sessions.)

| Bug ID | Severity | Module | File | Description | Root Cause | Fix | Regression Test | Status |
|---|---|---|---|---|---|---|---|---|
` + bugRows.map((b) => `| ${b.id} | ${b.sev} | ${b.mod} | ${b.file} | ${b.desc} | ${b.root || "—"} | ${b.fix || "—"} | ${b.test || "—"} | ${b.status} |`).join("\n"));

const sec = R.bugs.filter((b) => /Auth|Tenant|Payment|Security|Invoice|Ops|Student|Exam|Marks|Attendance|Notice|Fees|Shift|ClassSubject|Landing|Audit/i.test(b.mod) && b.sev !== "Low" && b.src === "SMS.pdf audit");
w("SECURITY_REGISTER.md", `# SECURITY_REGISTER
> GENERATED. Security-relevant subset of BUG_REGISTER (tenant isolation, authN/Z, payment, ops exposure).

Open security items: ${sec.filter((b) => b.status !== "Fixed").length} of ${sec.length}

| ID | Severity | Vulnerability | Affected | Risk | Fix | Test | Status |
|---|---|---|---|---|---|---|---|
` + sec.sort((x, y) => sevOrder[x.sev] - sevOrder[y.sev]).map((b) => `| ${b.id} | ${b.sev} | ${b.desc} | ${b.file} | ${b.sev === "Critical" ? "Cross-tenant data/financial compromise" : b.sev === "High" ? "Privilege/data exposure" : "Hardening gap"} | ${b.fix || "—"} | ${b.test || "—"} | ${b.status} |`).join("\n"));

w("ARCHITECTURE_DECISIONS.md", `# ARCHITECTURE_DECISIONS
> GENERATED. Add with \`node tools/mem.mjs decision "<title>" "<text>"\`. Do not re-litigate without a documented reason.

` + (R.decisions.length ? R.decisions.map((d, i) => `## AD-${String(i + 1).padStart(3, "0")} — ${d.title} (${d.date})\n${d.text}`).join("\n\n") : "_none yet_"));

w("CHANGELOG.md", `# CHANGELOG
> GENERATED. Newest last.

` + (R.changelog.length ? R.changelog.map((c) => `- **${c.date}** — ${c.text}`).join("\n") : "_empty_"));

w("TEST_STATUS.md", `# TEST_STATUS
> GENERATED. Update with \`node tools/mem.mjs tests "<suite>" total passed failed skipped\`.

Total: ${R.tests.total} · Passed: ${R.tests.passed} · Failed: ${R.tests.failed} · Skipped: ${R.tests.skipped}

| Suite | Total | Passed | Failed | Skipped |
|---|---|---|---|---|
` + R.tests.suites.map((s) => `| ${s.suite} | ${s.total} | ${s.passed} | ${s.failed} | ${s.skipped} |`).join("\n") + `

## Known failures / gaps
${(R.tests.known || []).map((k) => "- " + k).join("\n") || "- none recorded"}

## How to run
\`cd backend && npm test\` (needs a MongoDB; set TEST_MONGO_URI, default mongodb://127.0.0.1:27017/gfmsc_test).`);

const done = R.tasks.filter((t) => t.mark === "x").length;
const cur = R.tasks.find((t) => t.mark === "~") || R.tasks.find((t) => t.mark === " ");
const nxt = R.tasks.filter((t) => t.mark === " ").slice(0, 3);
const crit = open.filter((b) => b.sev === "Critical");
w("PROJECT_STATUS.md", `# PROJECT_STATUS
> GENERATED. Read this FIRST at the start of every session (then TASK_CHECKLIST, BUG_REGISTER, SECURITY_REGISTER, ARCHITECTURE_DECISIONS, TEST_STATUS, CHANGELOG).

**Updated:** ${now()}
**Verdict:** NOT production ready — ${crit.length} Critical and ${open.filter((b) => b.sev === "High").length} High issues still open. (Definition-of-Done gates in SMS.pdf are not all met; do not claim "production ready".)

## Progress
- Roadmap steps complete: ${done} / ${R.tasks.length}
- Current: ${cur ? `${cur.id} — ${cur.title}` : "—"}
- Next: ${nxt.map((t) => `${t.id} ${t.title}`).join(" · ") || "—"}
- Bugs: ${cnt(R.bugs, (b) => b.status === "Fixed")} fixed / ${R.bugs.length} total
- Tests: ${R.tests.passed}/${R.tests.total} passing

## Phase summary
` + [...new Set(R.tasks.map((t) => t.phase))].map((p) => { const ts = R.tasks.filter((t) => t.phase === p); return `- ${p}: ${cnt(ts, (t) => t.mark === "x")}/${ts.length} done`; }).join("\n") + `

## Blockers
${Object.entries(R.status).filter(([k]) => k.startsWith("blocker")).map(([, v]) => "- " + v).join("\n") || "- none recorded"}

## Remaining Critical/High issues
${open.filter((b) => b.sev !== "Medium").sort((x, y) => sevOrder[x.sev] - sevOrder[y.sev]).map((b) => `- ${b.id} [${b.sev}] ${b.desc}${b.status === "Partial" ? " (PARTIAL: " + b.fix + ")" : ""}`).join("\n") || "- none"}

## Notes
${Object.entries(R.status).filter(([k]) => !k.startsWith("blocker")).map(([k, v]) => `- **${k}**: ${v}`).join("\n") || "-"}
`);
console.log("rendered. tasks done:", done, "/", R.tasks.length, "| open bugs:", open.length);

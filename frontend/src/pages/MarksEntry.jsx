import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Checkbox } from "../components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Loader2,
  Save,
  Send,
  Lock,
  Unlock,
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  School,
  ShieldAlert,
  FileSpreadsheet,
  X,
} from "lucide-react";
import { getRole } from "../api/auth";
import { listSchools } from "../api/schools";
import {
  getMarksContext,
  getMarksSheet,
  getSheetStatus,
  saveMarksDraft,
  submitMarksSheet,
  lockMarksSheet,
  unlockMarksSheet,
  downloadMarksTemplateCsv,
  uploadMarksCsv,
} from "../api/marks";

// Marks Entry — role-aware. Teachers only ever see the (class, section, subject)
// triples they own; School Admins supervise any class in their school and can
// lock/unlock + bulk-upload; Super Admins get a strictly read-only school
// selector for debugging. Students & Guardians are blocked at the route level.

const PARTS = [
  { key: "written", label: "Written" },
  { key: "mcq", label: "MCQ" },
  { key: "practical", label: "Practical" },
];

// Standard Bangladeshi grading scale — mirrors backend utils/grade.js.
const DEFAULT_SCALE = [
  { min: 80, grade: "A+", gpa: 5.0 },
  { min: 70, grade: "A", gpa: 4.0 },
  { min: 60, grade: "A-", gpa: 3.5 },
  { min: 50, grade: "B", gpa: 3.0 },
  { min: 40, grade: "C", gpa: 2.0 },
  { min: 33, grade: "D", gpa: 1.0 },
  { min: 0, grade: "F", gpa: 0.0 },
];

const STATUS_META = {
  PENDING: { label: "Pending", variant: "secondary" },
  DRAFT: { label: "Draft", variant: "warning" },
  SUBMITTED: { label: "Submitted", variant: "default" },
  LOCKED: { label: "Locked", variant: "success" },
};

const NO_SECTION = "__none__";
const secToVal = (s) => (s ? s : NO_SECTION);
const valToSec = (v) => (v === NO_SECTION ? "" : v);

const previewGrade = (total, fullMarks, passMarks, scale) => {
  if (total < passMarks) return { grade: "F", gpa: 0 };
  const pct = fullMarks > 0 ? (total / fullMarks) * 100 : 0;
  const list = (Array.isArray(scale) && scale.length ? scale : DEFAULT_SCALE)
    .slice()
    .sort((a, b) => b.min - a.min);
  const hit = list.find((r) => pct >= r.min);
  return hit ? { grade: hit.grade, gpa: hit.gpa } : { grade: "-", gpa: 0 };
};

// Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF/LF) —
// intentionally mirrors the backend's parser so the in-browser preview always
// agrees with what the server will actually import.
const parseCsvText = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
};

// Client-side validation of an uploaded CSV, run BEFORE anything is sent to the
// server: unknown student IDs, non-numeric marks, out-of-range marks and rows
// whose written+mcq+practical exceeds the subject's full marks are all flagged
// so the user can fix the file and re-upload.
const buildCsvPreview = (text, roster, fullMarks) => {
  const table = parseCsvText(String(text || "").replace(/^\uFEFF/, ""));
  if (table.length < 2) {
    return { rows: [], error: "The CSV looks empty — it needs a header row plus at least one student row." };
  }
  const header = table[0].map((h) => String(h).trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  const iId = col("studentid");
  if (iId === -1) return { rows: [], error: 'The CSV is missing a "studentId" column.' };
  const iWritten = col("written");
  const iMcq = col("mcq");
  const iPractical = col("practical");
  const iAbsent = col("isabsent");

  const byId = new Map((roster || []).map((s) => [String(s.studentId).trim(), s]));
  const toNum = (v) => {
    const t = String(v ?? "").trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  };
  const isTrue = (v) => ["true", "1", "yes", "y", "ab"].includes(String(v ?? "").trim().toLowerCase());

  const out = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    const studentId = String(cells[iId] ?? "").trim();
    if (!studentId) continue;
    const isAbsent = iAbsent !== -1 && isTrue(cells[iAbsent]);
    const written = iWritten !== -1 ? toNum(cells[iWritten]) : null;
    const mcq = iMcq !== -1 ? toNum(cells[iMcq]) : null;
    const practical = iPractical !== -1 ? toNum(cells[iPractical]) : null;
    const student = byId.get(studentId);
    const problems = [];
    if (!student) problems.push("Unknown student ID");
    if (!isAbsent) {
      for (const [k, v] of [["Written", written], ["MCQ", mcq], ["Practical", practical]]) {
        if (v === null) continue;
        if (Number.isNaN(v)) problems.push(`${k} is not a number`);
        else if (v < 0 || v > fullMarks) problems.push(`${k} must be 0–${fullMarks}`);
      }
      const nums = [written, mcq, practical].filter((v) => typeof v === "number" && Number.isFinite(v));
      const total = nums.reduce((a, b) => a + b, 0);
      if (nums.length && total > fullMarks) problems.push(`Total ${total} exceeds ${fullMarks}`);
    }
    out.push({ studentId, student, isAbsent, written, mcq, practical, problems });
  }
  return { rows: out, error: out.length ? "" : "No student rows found in the CSV." };
};

// ---- Import CSV/Excel modal (School Admin) ------------------------------
// Download a pre-filled sample, drop a filled CSV, review the parsed rows +
// validation in-browser, then push the file to /api/marks-entry/bulk-upload.
function BulkImportDialog({ open, onOpenChange, roster, fullMarks, disabled, onDownloadTemplate, onUpload }) {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) return;
    setFile(null);
    setRows([]);
    setError("");
    setBusy(false);
    setDragOver(false);
  }, [open]);

  const readFile = async (f) => {
    if (!f) return;
    setError("");
    const looksCsv = /\.csv$/i.test(f.name) || f.type === "text/csv" || f.type === "application/vnd.ms-excel";
    if (!looksCsv) {
      setFile(null);
      setRows([]);
      setError("Only .csv files are supported. In Excel choose “Save As → CSV (Comma delimited)”, then upload that file.");
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setFile(null);
      setRows([]);
      setError("The file must be 2MB or smaller.");
      return;
    }
    try {
      const text = await f.text();
      const { rows: parsed, error: parseError } = buildCsvPreview(text, roster, fullMarks);
      setFile(f);
      setRows(parsed);
      setError(parseError || "");
    } catch {
      setFile(null);
      setRows([]);
      setError("Could not read that file. Please re-save it as CSV and try again.");
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) readFile(f);
  };

  const clearFile = () => {
    setFile(null);
    setRows([]);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const badRows = rows.filter((r) => r.problems.length > 0);
  const canUpload = Boolean(file) && rows.length > 0 && badRows.length === 0 && !busy && !disabled;

  const submit = async () => {
    if (!canUpload) return;
    setBusy(true);
    setError("");
    try {
      await onUpload(file);
      onOpenChange(false);
    } catch (err) {
      setError(err?.response?.data?.message || "The upload failed. Please check the file and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Import Marks (CSV)
          </DialogTitle>
          <DialogDescription>
            Download the pre-filled sample, fill in the marks in Excel/Sheets, save it as CSV and drop it below. Every row is
            validated in your browser before it is sent.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onDownloadTemplate} disabled={disabled}>
            <Download className="h-4 w-4 mr-2" /> Download Sample Template
          </Button>
        </div>

        {/* Drag-and-drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
          } ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30"}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={disabled}
            onChange={(e) => readFile(e.target.files?.[0])}
          />
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          {file ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <span className="font-medium">{file.name}</span>
              <span className="text-muted-foreground">({Math.max(1, Math.round(file.size / 1024))} KB)</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Drag &amp; drop a <span className="font-medium">.csv</span> file here, or click to browse.
            </p>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg border bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {rows.length} row(s) parsed · {badRows.length} with issues
              </span>
              {badRows.length === 0 ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> All rows valid
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <AlertCircle className="h-3 w-3" /> Fix {badRows.length} row(s)
                </Badge>
              )}
            </div>
            <div className="max-h-64 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Roll</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead className="w-20 text-center">Written</TableHead>
                    <TableHead className="w-20 text-center">MCQ</TableHead>
                    <TableHead className="w-20 text-center">Practical</TableHead>
                    <TableHead className="w-20 text-center">Absent</TableHead>
                    <TableHead>Validation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.studentId}-${i}`} className={r.problems.length ? "bg-red-50 dark:bg-red-900/20" : ""}>
                      <TableCell className="font-mono">{r.student?.classRoll ?? "-"}</TableCell>
                      <TableCell className="text-sm">
                        {r.student?.studentName || <span className="text-red-600 dark:text-red-400">Unknown</span>}
                        <span className="block text-xs text-muted-foreground">{r.studentId}</span>
                      </TableCell>
                      <TableCell className="text-center">{r.isAbsent ? "—" : r.written ?? ""}</TableCell>
                      <TableCell className="text-center">{r.isAbsent ? "—" : r.mcq ?? ""}</TableCell>
                      <TableCell className="text-center">{r.isAbsent ? "—" : r.practical ?? ""}</TableCell>
                      <TableCell className="text-center">{r.isAbsent ? "AB" : ""}</TableCell>
                      <TableCell className="text-xs">
                        {r.problems.length ? (
                          <span className="text-red-600 dark:text-red-400">{r.problems.join("; ")}</span>
                        ) : (
                          <span className="text-green-600 dark:text-green-400">OK</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canUpload}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Upload {rows.length ? `${rows.length} row(s)` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MarksEntry() {
  const role = getRole();
  const isSuper = role === "superAdmin";
  const isAdmin = role === "schoolAdmin" || isSuper;
  const readOnly = isSuper; // superAdmin can look but never edit

  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState("");

  const [ctx, setCtx] = useState(null);
  const [ctxLoading, setCtxLoading] = useState(!isSuper);
  const [ctxError, setCtxError] = useState("");

  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [subject, setSubject] = useState("");
  const [examId, setExamId] = useState("");

  const [sheet, setSheet] = useState(null);
  const [rows, setRows] = useState({});
  const [sheetLoading, setSheetLoading] = useState(false);

  const [subjectStatuses, setSubjectStatuses] = useState([]);
  const [statusMeta, setStatusMeta] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [lockBusy, setLockBusy] = useState("");

  const [saving, setSaving] = useState("");
  const [msg, setMsg] = useState(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const gridRef = useRef(null);

  // ---- superAdmin: load the school list for the selector ----------------
  useEffect(() => {
    if (!isSuper) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await listSchools();
        if (!cancelled) setSchools(data?.schools || []);
      } catch (err) {
        if (!cancelled) setCtxError(err?.response?.data?.message || "Could not load schools.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuper]);

  // ---- load the role-aware dropdown context -----------------------------
  const loadContext = useCallback(async () => {
    setCtxLoading(true);
    setCtxError("");
    try {
      const params = isSuper ? { schoolId } : {};
      const { data } = await getMarksContext(params);
      setCtx(data);
    } catch (err) {
      setCtx(null);
      setCtxError(err?.response?.data?.message || "Could not load your marks context.");
    } finally {
      setCtxLoading(false);
    }
  }, [isSuper, schoolId]);

  useEffect(() => {
    if (isSuper && !schoolId) {
      setCtx(null);
      return;
    }
    loadContext();
  }, [isSuper, schoolId, loadContext]);

  // ---- derived dropdown options ----------------------------------------
  const classOptions = useMemo(
    () => [...new Set((ctx?.options || []).map((o) => o.className))],
    [ctx]
  );
  const sectionOptions = useMemo(() => {
    const set = new Set(
      (ctx?.options || []).filter((o) => o.className === className).map((o) => o.section || "")
    );
    return [...set];
  }, [ctx, className]);
  const optionFor = useMemo(
    () => (ctx?.options || []).find((o) => o.className === className && (o.section || "") === section),
    [ctx, className, section]
  );
  const subjectOptions = useMemo(() => {
    if (optionFor) return optionFor.subjects || [];
    return [
      ...new Set(
        (ctx?.options || [])
          .filter((o) => o.className === className)
          .flatMap((o) => o.subjects || [])
      ),
    ];
  }, [optionFor, ctx, className]);
  const examOptions = useMemo(
    () =>
      (ctx?.exams || []).filter(
        (ex) => ex.className === className && ((ex.section || "") === section || !ex.section)
      ),
    [ctx, className, section]
  );

  // ---- auto-pick sensible defaults --------------------------------------
  useEffect(() => {
    if (!ctx) return;
    if (!className && classOptions.length === 1) setClassName(classOptions[0]);
  }, [ctx, className, classOptions]);

  useEffect(() => {
    if (!className) return;
    if (!sectionOptions.includes(section)) setSection(sectionOptions[0] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, sectionOptions]);

  useEffect(() => {
    if (!className) return;
    if (!subjectOptions.includes(subject)) setSubject(subjectOptions[0] || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, section, subjectOptions]);

  useEffect(() => {
    if (!className) return;
    const ids = examOptions.map((e) => e._id);
    if (!ids.includes(examId)) setExamId(ids[0] || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, section, examOptions]);

  // ---- sheet + subject status loading -----------------------------------
  const loadSheet = useCallback(async () => {
    if (!examId || !subject) {
      setSheet(null);
      setRows({});
      return;
    }
    setSheetLoading(true);
    setMsg(null);
    try {
      const params = { examId, subject, section };
      const { data } = await getMarksSheet(isSuper ? { ...params, schoolId } : params);
      setSheet(data);
      const next = {};
      (data.students || []).forEach((s) => {
        next[s._id] = {
          written: s.written ?? "",
          mcq: s.mcq ?? "",
          practical: s.practical ?? "",
          isAbsent: Boolean(s.isAbsent),
        };
      });
      setRows(next);
    } catch (err) {
      setSheet(null);
      setRows({});
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not load the marks sheet." });
    } finally {
      setSheetLoading(false);
    }
  }, [examId, subject, section, isSuper, schoolId]);

  useEffect(() => {
    loadSheet();
  }, [loadSheet]);

  const loadStatuses = useCallback(async () => {
    if (!isAdmin || !examId) {
      setSubjectStatuses([]);
      setStatusMeta(null);
      return;
    }
    setStatusLoading(true);
    try {
      const params = { examId, section };
      const { data } = await getSheetStatus(isSuper ? { ...params, schoolId } : params);
      setSubjectStatuses(data.subjects || []);
      setStatusMeta({ className: data.className, section: data.section, studentCount: data.studentCount });
    } catch {
      setSubjectStatuses([]);
      setStatusMeta(null);
    } finally {
      setStatusLoading(false);
    }
  }, [isAdmin, examId, section, isSuper, schoolId]);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  // ---- editing rules -----------------------------------------------------
  const locked = sheet?.status === "LOCKED";
  const submitted = sheet?.status === "SUBMITTED";
  // A teacher is frozen by SUBMITTED/LOCKED (the backend also refuses the
  // write); a School Admin keeps the documented override and can still edit.
  const frozenForUser = (submitted || locked) && !isAdmin;
  const disabled = readOnly || frozenForUser || !sheet?.editable;
  const fullMarks = sheet?.fullMarks ?? ctx?.defaults?.defaultFullMarks ?? 100;
  const passMarks = sheet?.passMarks ?? Math.round((fullMarks * (ctx?.defaults?.defaultPassPercent ?? 33)) / 100);
  const gradingScale = ctx?.defaults?.gradingScale;

  const setRow = (sid, patch) =>
    setRows((prev) => ({ ...prev, [sid]: { ...(prev[sid] || {}), ...patch } }));

  const handlePart = (sid, key, raw) => {
    if (raw === "") return setRow(sid, { [key]: "" });
    let n = Number(raw);
    if (!Number.isFinite(n)) return;
    if (n < 0) n = 0;
    // A single part may not exceed the paper's full marks; the row total is
    // checked separately below so the red-border warning can still trigger.
    if (n > fullMarks) n = fullMarks;
    setRow(sid, { [key]: String(n) });
  };

  const toggleAbsent = (sid, checked) =>
    setRow(sid, checked ? { isAbsent: true, written: "", mcq: "", practical: "" } : { isAbsent: false });

  const rowTotal = (r) =>
    PARTS.reduce((sum, p) => sum + (Number(r?.[p.key]) || 0), 0);

  // ---- keyboard navigation (Enter / Arrow keys between cells) -----------
  const focusCell = (rowIdx, partIdx) => {
    const el = gridRef.current?.querySelector(`[data-cell="${rowIdx}-${partIdx}"]`);
    if (el && !el.disabled) {
      el.focus();
      el.select?.();
      return true;
    }
    return false;
  };

  const onCellKeyDown = (e, rowIdx, partIdx, studentCount) => {
    let target = null;
    const v = e.currentTarget;
    if (e.key === "Enter" || e.key === "ArrowDown") target = [rowIdx + 1, partIdx];
    else if (e.key === "ArrowUp") target = [rowIdx - 1, partIdx];
    else if (e.key === "ArrowRight" && v.selectionStart === v.value.length) target = [rowIdx, partIdx + 1];
    else if (e.key === "ArrowLeft" && v.selectionStart === 0) target = [rowIdx, partIdx - 1];
    if (!target) return;
    e.preventDefault();
    const dir = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1;
    let [rr, cc] = target;
    const guardMax = studentCount * PARTS.length + PARTS.length + 5;
    for (let g = 0; g < guardMax; g++) {
      if (rr < 0 || rr >= studentCount) return;
      if (cc < 0 || cc >= PARTS.length) {
        rr += dir;
        cc = dir > 0 ? 0 : PARTS.length - 1;
        continue;
      }
      if (focusCell(rr, cc)) return;
      cc += dir;
    }
  };

  // ---- build the write payload -----------------------------------------
  const hadExisting = (s) =>
    s.written != null || s.mcq != null || s.practical != null || s.isAbsent;
  const buildRows = () => {
    const out = [];
    for (const s of sheet?.students || []) {
      const r = rows[s._id] || {};
      const isAbsent = Boolean(r.isAbsent);
      const anyFilled = ["written", "mcq", "practical"].some((k) => r[k] !== "" && r[k] !== undefined);
      if (!isAbsent && !anyFilled && !hadExisting(s)) continue; // untouched row
      out.push({
        studentId: s._id,
        subject: sheet.subject,
        isAbsent,
        written: r.written === "" || r.written === undefined ? 0 : Number(r.written) || 0,
        mcq: r.mcq === "" || r.mcq === undefined ? 0 : Number(r.mcq) || 0,
        practical: r.practical === "" || r.practical === undefined ? 0 : Number(r.practical) || 0,
      });
    }
    return out;
  };

  const doSave = async (status) => {
    setMsg(null);
    const list = buildRows();
    if (!list.length) {
      setMsg({ type: "error", text: "Nothing to save — enter at least one student's marks." });
      return;
    }
    const over = list.find((r) => !r.isAbsent && r.written + r.mcq + r.practical > fullMarks);
    if (over) {
      setMsg({ type: "error", text: `A student's total exceeds the full marks (${fullMarks}). Please correct it.` });
      return;
    }
    setSaving(status);
    try {
      const payload = { examId, section, rows: list };
      const req = isSuper ? { ...payload, schoolId } : payload;
      const { data } = status === "SUBMITTED" ? await submitMarksSheet(req) : await saveMarksDraft(req);
      setMsg({ type: "success", text: data?.message || "Marks saved." });
      await loadSheet();
      await loadStatuses();
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not save the marks." });
    } finally {
      setSaving("");
    }
  };

  const confirmFinalSubmit = async () => {
    setConfirmSubmit(false);
    await doSave("SUBMITTED");
  };

  const doSetLock = async (subjects, lock) => {
    if (!examId || !subjects.length) return;
    setLockBusy(lock ? "lock" : "unlock");
    setMsg(null);
    try {
      const payload = {
        examId,
        className: sheet?.className || statusMeta?.className || className,
        section,
        subjects,
      };
      const req = isSuper ? { ...payload, schoolId } : payload;
      const { data } = lock ? await lockMarksSheet(req) : await unlockMarksSheet(req);
      setMsg({ type: "success", text: data?.message || (lock ? "Marks locked." : "Marks unlocked.") });
      await loadStatuses();
      await loadSheet();
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not change the lock state." });
    } finally {
      setLockBusy("");
    }
  };

  // ---- CSV ---------------------------------------------------------------
  const downloadTemplate = async () => {
    if (!examId || !subject) return;
    setMsg(null);
    try {
      const params = { examId, subject, section };
      const res = await downloadMarksTemplateCsv(isSuper ? { ...params, schoolId } : params);
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `marks-${(sheet?.className || className || "class")}-${section || "all"}-${subject}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setMsg({ type: "error", text: err?.response?.data?.message || "Could not download the CSV template." });
    }
  };

  // Called by the import dialog after client-side validation passes.
  const importFile = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("examId", examId);
    fd.append("subject", subject);
    fd.append("section", section);
    fd.append("status", "DRAFT");
    if (isSuper) fd.append("schoolId", schoolId);
    const { data } = await uploadMarksCsv(fd, {});
    setMsg({ type: "success", text: data?.message || "Marks imported." });
    await loadSheet();
    await loadStatuses();
    return data;
  };

  // ---- guards ------------------------------------------------------------
  if (role === "student" || role === "guardian") {
    return <Navigate to="/dashboard" replace />;
  }

  const selectionReady = Boolean(examId && subject && sheet);

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8 pb-28">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marks Entry</h1>
          <p className="text-muted-foreground mt-1">
            {isSuper
              ? "Read-only inspection of any school's marks. Select a school to continue."
              : role === "teacher"
              ? "Only the classes, sections and subjects assigned to you are listed."
              : "Supervise, override and lock marks for any class in your school."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {readOnly && (
            <Badge variant="warning" className="gap-1">
              <ShieldAlert className="h-3 w-3" /> Read-only
            </Badge>
          )}
          <Badge variant="outline" className="capitalize">{role}</Badge>
        </div>
      </div>

      {msg && (
        <div
          className={`flex items-start gap-2 p-4 rounded-lg border ${
            msg.type === "success"
              ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
              : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
          }`}
        >
          {msg.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
          )}
          <span>{msg.text}</span>
        </div>
      )}

      {/* SuperAdmin: clean school selector (no raw developer warning) */}
      {isSuper && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <School className="h-5 w-5" /> Select School
            </CardTitle>
            <CardDescription>
              Marks Entry is hidden from the Super Admin navigation. Pick a school below to inspect its marks in read-only mode.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-w-sm space-y-2">
              <Label>School</Label>
              <Select value={schoolId} onValueChange={setSchoolId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a school..." />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {ctxError && (
        <div className="flex items-start gap-2 p-4 rounded-lg border bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">
          <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
          <span>{ctxError}</span>
        </div>
      )}

      {ctxLoading ? (
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          Loading your access...
        </div>
      ) : ctx && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Exam, Class, Section &amp; Subject</CardTitle>
              <CardDescription>
                {role === "teacher"
                  ? "These choices only include what the school admin assigned to you."
                  : "Any class, section and subject within this school."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={className} onValueChange={setClassName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classOptions.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {classOptions.length === 0 && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-500">
                    No classes are assigned to you yet — ask the school admin.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Section</Label>
                <Select value={secToVal(section)} onValueChange={(v) => setSection(valToSec(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectionOptions.map((s) => (
                      <SelectItem key={secToVal(s)} value={secToVal(s)}>
                        {s ? s : "No section"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Subject</Label>
                <Select value={subject} onValueChange={setSubject} disabled={!className || !subjectOptions.length}>
                  <SelectTrigger>
                    <SelectValue placeholder={className ? "Select subject" : "Select a class first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {subjectOptions.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Exam Term</Label>
                <Select value={examId} onValueChange={setExamId} disabled={!examOptions.length}>
                  <SelectTrigger>
                    <SelectValue placeholder={className ? "Select exam" : "Select a class first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {examOptions.map((x) => (
                      <SelectItem key={x._id} value={x._id}>
                        {x.name}{x.term ? ` (${x.term})` : ""}{x.isPublished ? " • published" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Admin: per-subject status + Lock/Unlock */}
          {isAdmin && examId && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Submission Status &amp; Lock Control</CardTitle>
                  <CardDescription>
                    {statusMeta?.className || sheet?.className || className}
                    {statusMeta?.section ? ` - ${statusMeta.section}` : ""} • {statusMeta?.studentCount ?? 0} student(s).
                    Freeze every mark before publishing results.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={readOnly || !subjectStatuses.length || lockBusy !== ""}
                    onClick={() => doSetLock(subjectStatuses.map((s) => s.subject), false)}
                  >
                    {lockBusy === "unlock" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Unlock className="h-4 w-4 mr-1" />}
                    Unlock All
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={readOnly || !subjectStatuses.length || lockBusy !== ""}
                    onClick={() => doSetLock(subjectStatuses.map((s) => s.subject), true)}
                  >
                    {lockBusy === "lock" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
                    Lock All
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {statusLoading ? (
                  <div className="p-6 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </div>
                ) : subjectStatuses.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">No subjects configured for this class.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead className="w-32">Status</TableHead>
                          <TableHead className="w-32">Marks Entered</TableHead>
                          <TableHead className="w-48 text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subjectStatuses.map((s) => {
                          const meta = STATUS_META[s.status] || STATUS_META.PENDING;
                          return (
                            <TableRow key={s.subject} className={s.subject === subject ? "bg-muted/40" : ""}>
                              <TableCell className="font-medium">{s.subject}</TableCell>
                              <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                              <TableCell>{s.entered} / {statusMeta?.studentCount ?? 0}</TableCell>
                              <TableCell className="text-right">
                                {s.status === "LOCKED" ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={readOnly || lockBusy !== ""}
                                    onClick={() => doSetLock([s.subject], false)}
                                  >
                                    <Unlock className="h-4 w-4 mr-1" /> Unlock to Draft
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={readOnly || lockBusy !== ""}
                                    onClick={() => doSetLock([s.subject], true)}
                                  >
                                    <Lock className="h-4 w-4 mr-1" /> Lock Marks
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* The marks grid */}
          {sheetLoading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                Loading marks...
              </CardContent>
            </Card>
          ) : selectionReady && (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>
                    {sheet.className}
                    {sheet.section ? ` - ${sheet.section}` : ""} — {sheet.subject}
                  </CardTitle>
                  <CardDescription>
                    Full marks {fullMarks}, pass {passMarks}. Use Enter / Arrow keys to move between cells.
                    Tick “Absent” to record AB (no numeric mark).
                  </CardDescription>
                </div>
                <Badge variant={(STATUS_META[sheet.status] || STATUS_META.DRAFT).variant} className="shrink-0">
                  {(STATUS_META[sheet.status] || STATUS_META.DRAFT).label}
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                {frozenForUser && (
                  <div className="flex items-center gap-2 m-4 p-3 rounded-lg border bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800 text-sm">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span>
                      Marks Submitted (Locked for editing)
                      {locked ? " — this sheet is locked." : "."} Ask the school admin to unlock it if a correction is needed.
                    </span>
                  </div>
                )}
                {!frozenForUser && sheet.status !== "DRAFT" && isAdmin && (
                  <div className="flex items-center gap-2 m-4 p-3 rounded-lg border bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800 text-sm">
                    <ShieldAlert className="h-4 w-4 shrink-0" />
                    <span>
                      This sheet is {sheet.status}. As a School Admin you can still edit and save an override.
                    </span>
                  </div>
                )}
                {sheet.students.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No students found in this class/section.</div>
                ) : (
                  <div className="overflow-x-auto" ref={gridRef}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">Roll</TableHead>
                          <TableHead className="min-w-[180px]">Name</TableHead>
                          {PARTS.map((p) => (
                            <TableHead key={p.key} className="w-28 text-center">{p.label}</TableHead>
                          ))}
                          <TableHead className="w-24 text-center">Total</TableHead>
                          <TableHead className="w-20 text-center">Grade</TableHead>
                          <TableHead className="w-24 text-center">Absent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sheet.students.map((s, rowIdx) => {
                          const r = rows[s._id] || {};
                          const absent = Boolean(r.isAbsent);
                          const total = rowTotal(r);
                          const overFull = !absent && total > fullMarks;
                          const g = absent
                            ? { grade: "AB", gpa: 0 }
                            : previewGrade(total, fullMarks, passMarks, gradingScale);
                          return (
                            <TableRow key={s._id} className={absent ? "bg-muted/40" : ""}>
                              <TableCell className="font-mono">{s.classRoll}</TableCell>
                              <TableCell className="font-medium">{s.studentName}</TableCell>
                              {PARTS.map((p, partIdx) => (
                                <TableCell key={p.key} className="text-center">
                                  <Input
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    max={fullMarks}
                                    data-cell={`${rowIdx}-${partIdx}`}
                                    value={absent ? "" : r[p.key] ?? ""}
                                    disabled={disabled || absent}
                                    onChange={(e) => handlePart(s._id, p.key, e.target.value)}
                                    onKeyDown={(e) => onCellKeyDown(e, rowIdx, partIdx, sheet.students.length)}
                                    aria-invalid={overFull || undefined}
                                    className={`w-20 mx-auto text-center ${
                                      overFull ? "border-red-500 focus-visible:ring-red-500 dark:border-red-500" : ""
                                    }`}
                                  />
                                </TableCell>
                              ))}
                              <TableCell className={`text-center font-semibold ${overFull ? "text-red-600 dark:text-red-400" : ""}`}>
                                {absent ? "AB" : total}
                              </TableCell>
                              <TableCell className="text-center">{g.grade}</TableCell>
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={absent}
                                  disabled={disabled}
                                  onCheckedChange={(c) => toggleAbsent(s._id, c)}
                                  aria-label={`Mark ${s.studentName} absent`}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* CSV bulk import (School Admin only — the endpoint is admin-only) */}
          {isAdmin && selectionReady && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" /> Bulk Import
                </CardTitle>
                <CardDescription>
                  Import marks for this subject from a CSV file. Download the sample template, fill it in and upload it back.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={() => setImportOpen(true)} disabled={readOnly}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Import CSV/Excel
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Persistent action bar */}
      {selectionReady && sheet.students.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:left-72 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-4 flex flex-wrap justify-end gap-3 shadow-lg z-40">
          {frozenForUser && (
            <span className="mr-auto self-center text-sm text-amber-700 dark:text-amber-300">
              Marks Submitted (Locked for editing){readOnly ? "" : " — ask the school admin to unlock."}
            </span>
          )}
          {!frozenForUser && locked && isAdmin && (
            <span className="mr-auto self-center text-sm text-amber-700 dark:text-amber-300">
              Locked — admin override enabled; your save will update the sheet.
            </span>
          )}
          <Button
            variant="outline"
            disabled={disabled || saving !== ""}
            onClick={() => doSave("DRAFT")}
          >
            {saving === "DRAFT" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save as Draft
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={disabled || saving !== ""}
            onClick={() => setConfirmSubmit(true)}
          >
            {saving === "SUBMITTED" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Final Submit
          </Button>
        </div>
      )}

      {/* Final Submit confirmation */}
      <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Final Submit</DialogTitle>
            <DialogDescription>
              Submitting freezes these marks for teachers — only a School Admin can unlock them afterwards. Continue?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmSubmit(false)} disabled={saving === "SUBMITTED"}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={confirmFinalSubmit}
              disabled={saving === "SUBMITTED"}
            >
              {saving === "SUBMITTED" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Yes, Submit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk import modal */}
      <BulkImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        roster={sheet?.students || []}
        fullMarks={fullMarks}
        disabled={readOnly}
        onDownloadTemplate={downloadTemplate}
        onUpload={importFile}
      />
    </div>
  );
}

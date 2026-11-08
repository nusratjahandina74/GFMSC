import { useEffect, useRef, useState } from "react";
import { UploadCloud, X, Star, ImagePlus, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
let counter = 0;
const nextId = () => `img-${Date.now()}-${counter++}`;

/**
 * Multi-image upload box: click or drag & drop, preview grid, "Make cover", remove (X).
 *
 * Props
 *  - onUpload(files, coverIndex, { title, description, status }, onProgress) -> Promise
 *      called when the admin presses the Upload button. coverIndex is -1 when no cover was chosen.
 *      Throw (reject) to show an error and keep the selection.
 *  - maxFiles (default 10), maxMB (default 5)
 */
export default function MultiImageUploader({ onUpload, maxFiles = 10, maxMB = 5 }) {
  const [items, setItems] = useState([]); // { id, key, file, preview }
  const [coverId, setCoverId] = useState(null);
  const [problems, setProblems] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState("");
  const inputRef = useRef(null);
  const itemsRef = useRef([]);
  useEffect(() => {
    itemsRef.current = items; // latest list for the unmount cleanup below
  }, [items]);

  // free the blob: preview URLs when the component goes away
  useEffect(() => () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.preview)), []);

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;
    const found = [];
    const accepted = [];
    const keys = new Set(items.map((i) => i.key));
    let room = maxFiles - items.length;

    for (const file of incoming) {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (!ALLOWED_TYPES.includes(file.type)) found.push(`${file.name}: only JPG, PNG or WEBP images are allowed.`);
      else if (file.size > maxMB * 1024 * 1024) found.push(`${file.name}: larger than ${maxMB}MB.`);
      else if (keys.has(key)) found.push(`${file.name}: already selected.`);
      else if (room <= 0) found.push(`${file.name}: you can upload up to ${maxFiles} images at once.`);
      else {
        keys.add(key);
        room -= 1;
        accepted.push({ id: nextId(), key, file, preview: URL.createObjectURL(file) });
      }
    }
    setProblems(found);
    setDone("");
    setServerError("");
    if (accepted.length) setItems((prev) => [...prev, ...accepted]);
  };

  const removeItem = (id) => {
    const target = items.find((i) => i.id === id);
    if (target) URL.revokeObjectURL(target.preview);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setCoverId((c) => (c === id ? null : c));
    setProblems([]);
  };

  const toggleCover = (id) => setCoverId((c) => (c === id ? null : id)); // exactly one cover at a time

  const clearAll = () => {
    items.forEach((i) => URL.revokeObjectURL(i.preview));
    setItems([]);
    setCoverId(null);
    setProblems([]);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    addFiles(e.dataTransfer?.files);
  };

  const openPicker = () => !busy && inputRef.current?.click();

  const submit = async () => {
    if (items.length === 0 || busy) return;
    setBusy(true);
    setProgress(0);
    setServerError("");
    setDone("");
    try {
      const coverIndex = items.findIndex((i) => i.id === coverId);
      await onUpload(items.map((i) => i.file), coverIndex, { title: title.trim(), description: description.trim(), status }, setProgress);
      setDone(`${items.length} image${items.length > 1 ? "s" : ""} uploaded.`);
      clearAll();
      setTitle("");
      setDescription("");
      setStatus("active");
    } catch (err) {
      setServerError(err?.response?.data?.message || err?.message || "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const dropHandlers = {
    onDragOver: (e) => {
      e.preventDefault();
      if (!busy) setDragging(true);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
    },
    onDrop,
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = ""; // allow picking the same file again after removing it
        }}
      />

      <div
        {...dropHandlers}
        className={`rounded-2xl border-2 border-dashed p-4 transition-colors ${
          dragging ? "border-green-500 bg-green-50 dark:bg-green-900/20" : "border-green-300/70 bg-gray-50 dark:bg-gray-800/40"
        }`}
      >
        {items.length === 0 ? (
          <button
            type="button"
            onClick={openPicker}
            className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
          >
            <UploadCloud className="h-8 w-8" />
            <span className="text-sm font-semibold">Upload images</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Click here or drag &amp; drop</span>
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((item) => {
              const isCover = item.id === coverId;
              return (
                <div
                  key={item.id}
                  className={`relative overflow-hidden rounded-xl border-2 bg-white dark:bg-gray-900 ${
                    isCover ? "border-green-600" : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <img src={item.preview} alt={item.file.name} className="h-32 w-full object-cover" />

                  {isCover && (
                    <button
                      type="button"
                      onClick={() => toggleCover(item.id)}
                      disabled={busy}
                      title="Click to remove the cover mark"
                      className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-1 text-xs font-semibold text-white shadow"
                    >
                      <Star className="h-3 w-3 fill-current" /> Cover
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={busy}
                    aria-label={`Remove ${item.file.name}`}
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-red-600 shadow hover:bg-red-50 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  <div className="p-2">
                    {isCover ? (
                      <p className="truncate text-center text-xs text-gray-500 dark:text-gray-400">{item.file.name}</p>
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="w-full" disabled={busy} onClick={() => toggleCover(item.id)}>
                        <Star className="h-3.5 w-3.5" /> Make cover
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {items.length < maxFiles && (
              <button
                type="button"
                onClick={openPicker}
                disabled={busy}
                className="flex min-h-[10rem] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50 dark:text-green-400 dark:hover:bg-green-900/20"
              >
                <ImagePlus className="h-6 w-6" />
                <span className="text-sm font-semibold">Add more</span>
              </button>
            )}
          </div>
        )}

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Drag photos here or click upload. Up to {maxFiles} images, {maxMB} MB each (JPG, PNG, WEBP). The cover image is shown first on the website.
          {items.length > 0 && ` ${items.length}/${maxFiles} selected${coverId ? "" : " — no cover chosen, the current cover (if any) stays."}`}
        </p>
      </div>

      {problems.length > 0 && (
        <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          {problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      {serverError && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{serverError}</div>}
      {done && (
        <div className="flex items-center gap-2 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" /> {done}
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Title / caption (optional)</Label>
              <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Applied to every image in this upload" disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Input value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={busy}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
              >
                <option value="active">Active (show on website)</option>
                <option value="inactive">Inactive (hidden)</option>
              </select>
            </div>
          </div>

          {busy && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div className="h-full bg-green-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={submit} disabled={busy} className="bg-green-600 text-white hover:bg-green-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {busy ? `Uploading… ${progress}%` : `Upload ${items.length} image${items.length > 1 ? "s" : ""}`}
            </Button>
            <Button type="button" variant="ghost" onClick={clearAll} disabled={busy}>
              Clear selection
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

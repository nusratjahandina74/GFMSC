import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Loader2, Plus, Pencil, Trash2, Check, X, ArrowUp, ArrowDown } from "lucide-react";
import api from "../../api/client";

const MAX_LEN = 200;
const SLUG = "gfmsc";
const PER_PAGE = 5;

function Pager({ page, pages, onChange }) {
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1);
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 pt-2">
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Prev
      </Button>
      {nums.map((n) => (
        <Button
          key={n}
          type="button"
          size="sm"
          variant={n === page ? "default" : "outline"}
          className={n === page ? "bg-green-600 text-white hover:bg-green-700" : ""}
          onClick={() => onChange(n)}
        >
          {n}
        </Button>
      ))}
      <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </div>
  );
}

export default function TickerManager() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(null);
  const [items, setItems] = useState([]);
  const [newText, setNewText] = useState("");
  const [pg, setPg] = useState(1);
  const [editIdx, setEditIdx] = useState(-1);
  const [editText, setEditText] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("success");

  const say = (text, type = "success") => {
    setMsg(text);
    setMsgType(type);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/landing-pages");
      const pages = res.data?.pages || [];
      const p = pages.find((x) => x.slug === SLUG) || pages[0] || null;
      setPage(p);
      setItems(Array.isArray(p?.ticker) ? p.ticker.filter(Boolean) : []);
    } catch (err) {
      say(err?.response?.data?.message || "Could not load ticker.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Every change (add / edit / delete / reorder) is saved straight to the database.
  const persist = async (next, okText) => {
    if (!page?._id) return say("Create the Landing Page first (Admin > Landing Page).", "error");
    setBusy(true);
    say("");
    try {
      const res = await api.put(`/landing-pages/${page._id}`, { ticker: next });
      setPage(res.data);
      setItems(Array.isArray(res.data?.ticker) ? res.data.ticker : next);
      say(okText);
      return true;
    } catch (err) {
      say(err?.response?.data?.message || "Could not save. Please try again.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const t = newText.trim();
    if (!t) return;
    if (items.length >= 30) return say("You can keep at most 30 ticker messages.", "error");
    if (await persist([...items, t], "Added. Refresh the home page to see it.")) {
      setNewText("");
      setPg(Math.ceil((items.length + 1) / PER_PAGE));
    }
  };

  const startEdit = (i) => {
    setEditIdx(i);
    setEditText(items[i]);
  };

  const saveEdit = async () => {
    const t = editText.trim();
    if (!t) return say("Text cannot be empty. Use Delete to remove it.", "error");
    if (await persist(items.map((x, i) => (i === editIdx ? t : x)), "Updated.")) setEditIdx(-1);
  };

  const remove = async (i) => {
    if (!window.confirm("Delete this ticker message?")) return;
    if (await persist(items.filter((_, idx) => idx !== i), "Deleted.")) setEditIdx(-1);
  };

  const move = async (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setEditIdx(-1);
    await persist(next, "Order updated.");
  };

  const pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const cur = Math.min(pg, pages); // stays valid after deleting the last item of a page
  const visible = items.map((text, i) => ({ text, i })).slice((cur - 1) * PER_PAGE, cur * PER_PAGE);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Notice Ticker</h1>
        <p className="text-sm text-muted-foreground">
          The scrolling messages under the menu on the home page (e.g. "Admission is now open").
        </p>
      </div>

      {msg && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            msgType === "error" ? "border-red-300 bg-red-50 text-red-700" : "border-green-300 bg-green-50 text-green-700"
          }`}
        >
          {msg}
        </div>
      )}

      {!page && (
        <Card>
          <CardContent className="p-4 text-sm">
            No landing page found yet. Create it first from <b>Admin &gt; Landing Page</b>, then come back here.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add new message</CardTitle>
          <CardDescription>It appears at the end of the scrolling line.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={newText}
              maxLength={MAX_LEN}
              placeholder="e.g. Admission is now open"
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              disabled={!page || busy}
            />
            <Button type="button" className="bg-green-600 text-white hover:bg-green-700" onClick={add} disabled={!page || busy || !newText.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current messages ({items.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">No messages yet. The ticker is hidden on the home page until you add one.</p>
          )}

          {visible.map(({ text, i }) => (
            <div key={`${i}-${text}`} className="flex items-center gap-2 rounded-md border p-2">
              {editIdx === i ? (
                <>
                  <Input
                    autoFocus
                    value={editText}
                    maxLength={MAX_LEN}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") setEditIdx(-1);
                    }}
                  />
                  <Button type="button" size="sm" className="bg-green-600 text-white hover:bg-green-700" onClick={saveEdit} disabled={busy}>
                    <Check className="h-4 w-4" /> Save
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditIdx(-1)} disabled={busy}>
                    <X className="h-4 w-4" /> Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 break-words text-sm">📌 {text}</span>
                  <Button type="button" size="sm" variant="ghost" disabled={busy || i === 0} onClick={() => move(i, -1)} title="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={busy || i === items.length - 1} onClick={() => move(i, 1)} title="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => startEdit(i)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => remove(i)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </>
              )}
            </div>
          ))}
          <Pager page={cur} pages={pages} onChange={(n) => { setEditIdx(-1); setPg(n); }} />
        </CardContent>
      </Card>
    </div>
  );
}

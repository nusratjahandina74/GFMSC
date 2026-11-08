import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Button } from "../../components/ui/button";
import { Loader2, ImagePlus, Trash2, Plus } from "lucide-react";
import api from "../../api/client";
import { uploadImage } from "../../api/uploads";

const MAX_MB = 5;

// One image: preview + upload to Cloudinary (+ optional remove)
function ImageField({ label, value, onChange, folder = "landing", onError }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return onError("Only JPG, PNG, WEBP or GIF images are allowed.");
    if (file.size > MAX_MB * 1024 * 1024) return onError(`Image must be smaller than ${MAX_MB}MB.`);
    setBusy(true);
    try {
      const data = await uploadImage(file, folder);
      onChange(data.url);
    } catch (err) {
      onError(err?.response?.data?.message || "Image upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}
      <div className="flex items-center gap-3">
        <div className="h-20 w-28 shrink-0 overflow-hidden rounded-md border bg-muted flex items-center justify-center">
          {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={pick} />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {busy ? "Uploading..." : value ? "Change image" : "Upload image"}
          </Button>
          {value && !busy && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange("")}>
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LandingEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(null);
  const [slug, setSlug] = useState("gfmsc");
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
      setPage(pages[0] || null);
    } catch (err) {
      say(err?.response?.data?.message || "Could not load landing page.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createPage = async () => {
    setSaving(true);
    try {
      const res = await api.post("/landing-pages", { slug });
      setPage(res.data);
      say("Landing page created. Now add your images.");
    } catch (err) {
      say(err?.response?.data?.message || "Could not create page.", "error");
    } finally {
      setSaving(false);
    }
  };

  const setField = (section, key, value) => setPage((p) => ({ ...p, [section]: { ...(p[section] || {}), [key]: value } }));
  const setListItem = (list, i, patch) =>
    setPage((p) => ({ ...p, [list]: (p[list] || []).map((it, idx) => (idx === i ? { ...it, ...patch } : it)) }));
  const addListItem = (list, item) => setPage((p) => ({ ...p, [list]: [...(p[list] || []), item] }));
  const removeListItem = (list, i) => setPage((p) => ({ ...p, [list]: (p[list] || []).filter((_, idx) => idx !== i) }));

  const save = async () => {
    setSaving(true);
    say("");
    try {
      const body = {
        school: page.school || {},
        about: page.about || {},
        slides: (page.slides || []).filter((s) => s.url),
        gallery: (page.gallery || []).filter((g) => g.url),
        blogs: (page.blogs || []).filter((b) => b.title),
      };
      const res = await api.put(`/landing-pages/${page._id}`, body);
      setPage(res.data);
      say("Saved. Refresh the home page to see the new images.");
    } catch (err) {
      say(err?.response?.data?.message || "Save failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const err = (t) => say(t, "error");

  return (
    <div className="space-y-6 p-4 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Landing Page Images</h1>
        <p className="text-sm text-muted-foreground">Images are stored permanently on Cloudinary and shown on the public home page.</p>
      </div>

      {msg && (
        <div className={`rounded-md border p-3 text-sm ${msgType === "error" ? "border-red-300 bg-red-50 text-red-700" : "border-green-300 bg-green-50 text-green-700"}`}>
          {msg}
        </div>
      )}

      {!page ? (
        <Card>
          <CardHeader>
            <CardTitle>No landing page yet</CardTitle>
            <CardDescription>The public home page loads the page with the slug below (default: gfmsc).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Slug</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
            <Button onClick={createPage} disabled={saving} className="bg-green-600 text-white hover:bg-green-700">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create landing page
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {page.slug !== "gfmsc" && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              This page's slug is "{page.slug}", but the public home page loads the slug "gfmsc". Images will only show on the home page for slug "gfmsc".
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>School logo</CardTitle>
            </CardHeader>
            <CardContent>
              <ImageField value={page.school?.logo} onChange={(u) => setField("school", "logo", u)} folder="logo" onError={err} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Slider images</CardTitle>
              <CardDescription>Big banner images at the top of the home page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(page.slides || []).map((s, i) => (
                <div key={i} className="flex items-start justify-between gap-3 border-b pb-3">
                  <ImageField value={s.url} onChange={(u) => setListItem("slides", i, { url: u })} onError={err} />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeListItem("slides", i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => addListItem("slides", { url: "", alt: "" })}>
                <Plus className="h-4 w-4" /> Add slide
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>About section</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={page.about?.title || ""} onChange={(e) => setField("about", "title", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={page.about?.description || ""} onChange={(e) => setField("about", "description", e.target.value)} />
              </div>
              <ImageField label="Image" value={page.about?.image} onChange={(u) => setField("about", "image", u)} onError={err} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gallery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(page.gallery || []).map((g, i) => (
                <div key={i} className="flex items-start justify-between gap-3 border-b pb-3">
                  <div className="space-y-2">
                    <ImageField value={g.url} onChange={(u) => setListItem("gallery", i, { url: u })} onError={err} />
                    <Input placeholder="Caption / alt text" value={g.alt || ""} onChange={(e) => setListItem("gallery", i, { alt: e.target.value })} />
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeListItem("gallery", i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => addListItem("gallery", { url: "", alt: "" })}>
                <Plus className="h-4 w-4" /> Add gallery image
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Blog posts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(page.blogs || []).map((b, i) => (
                <div key={i} className="space-y-2 border-b pb-3">
                  <div className="flex gap-2">
                    <Input placeholder="Title" value={b.title || ""} onChange={(e) => setListItem("blogs", i, { title: e.target.value })} />
                    <Input placeholder="Date" className="w-40" value={b.date || ""} onChange={(e) => setListItem("blogs", i, { date: e.target.value })} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeListItem("blogs", i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea placeholder="Description" value={b.description || ""} onChange={(e) => setListItem("blogs", i, { description: e.target.value })} />
                  <ImageField value={b.image} onChange={(u) => setListItem("blogs", i, { image: u })} onError={err} />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => addListItem("blogs", { title: "", image: "", description: "", date: "" })}>
                <Plus className="h-4 w-4" /> Add blog post
              </Button>
            </CardContent>
          </Card>

          {/* Sticky save bar: always visible at the bottom of the screen. Colours are explicit because landing.css
              redefines --primary and makes the default (bg-primary) Button invisible. */}
          <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t bg-white/95 px-4 py-3 backdrop-blur dark:bg-gray-900/95">
            <p className="text-xs text-muted-foreground">Text and image changes on this page are saved together.</p>
            <Button onClick={save} disabled={saving} className="bg-green-600 text-white hover:bg-green-700">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

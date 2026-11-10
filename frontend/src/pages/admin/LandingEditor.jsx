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

// Editable list of { label, url } rows (footer links, services, top action links)
function LinkList({ items, onChange, labelPh = "Label", urlPh = "Link (/page, https://..., #contact)", addText = "Add link" }) {
  const list = items || [];
  const patch = (i, p) => onChange(list.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  return (
    <div className="space-y-2">
      {list.map((it, i) => (
        <div key={i} className="flex gap-2">
          <Input placeholder={labelPh} value={it.label || ""} onChange={(e) => patch(i, { label: e.target.value })} />
          <Input placeholder={urlPh} value={it.url || ""} onChange={(e) => patch(i, { url: e.target.value })} />
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(list.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...list, { label: "", url: "" }])}>
        <Plus className="h-4 w-4" /> {addText}
      </Button>
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

  // list that lives inside a section object, e.g. footer.importantLinks or leadership.members
  const setNestedList = (section, key, list) => setPage((p) => ({ ...p, [section]: { ...(p[section] || {}), [key]: list } }));
  const setNestedItem = (section, key, i, patch) =>
    setNestedList(section, key, ((page?.[section]?.[key]) || []).map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

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
        noticeBoard: page.noticeBoard || {},
        branchesTitle: page.branchesTitle || "",
        branches: (page.branches || []).filter((b) => b.name),
        leadership: {
          ...(page.leadership || {}),
          members: (page.leadership?.members || []).filter((m) => m.name),
        },
        footer: {
          ...(page.footer || {}),
          actions: (page.footer?.actions || []).filter((x) => x.label),
          importantLinks: (page.footer?.importantLinks || []).filter((x) => x.label),
          services: (page.footer?.services || []).filter((x) => x.label),
          contactBlocks: (page.footer?.contactBlocks || []).filter((x) => x.label),
        },
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
        <h1 className="text-2xl font-bold">Landing Page</h1>
        <p className="text-sm text-muted-foreground">Everything here (images, notices, branches, Chairman/Principal, footer) is shown on the public home page. Add, change or delete, then press Save changes.</p>
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

          {/* ---------- Chairman / Principal ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>School intro, Chairman &amp; Principal</CardTitle>
              <CardDescription>Text on the left, photos on the right. Add a message to show it below the photos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={page.leadership?.title || ""} onChange={(e) => setField("leadership", "title", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea rows={6} value={page.leadership?.description || ""} onChange={(e) => setField("leadership", "description", e.target.value)} />
              </div>
              {(page.leadership?.members || []).map((m, i) => (
                <div key={i} className="space-y-2 border-b pb-3">
                  <div className="flex gap-2">
                    <Input placeholder="Name" value={m.name || ""} onChange={(e) => setNestedItem("leadership", "members", i, { name: e.target.value })} />
                    <Input placeholder="Designation (e.g. Chairman)" value={m.designation || ""} onChange={(e) => setNestedItem("leadership", "members", i, { designation: e.target.value })} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setNestedList("leadership", "members", (page.leadership?.members || []).filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Textarea placeholder="Message (optional)" value={m.message || ""} onChange={(e) => setNestedItem("leadership", "members", i, { message: e.target.value })} />
                  <ImageField label="Photo" value={m.photo} onChange={(u) => setNestedItem("leadership", "members", i, { photo: u })} folder="people" onError={err} />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setNestedList("leadership", "members", [...(page.leadership?.members || []), { name: "", designation: "", photo: "", message: "" }])}>
                <Plus className="h-4 w-4" /> Add person
              </Button>
            </CardContent>
          </Card>

          {/* ---------- Notice board ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>Notice board</CardTitle>
              <CardDescription>Heading of the green notice board on the home page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Heading (Our Notice Board)" value={page.noticeBoard?.title || ""} onChange={(e) => setField("noticeBoard", "title", e.target.value)} />
                <Input placeholder="Small text under heading" value={page.noticeBoard?.subtitle || ""} onChange={(e) => setField("noticeBoard", "subtitle", e.target.value)} />
              </div>
              <p className="text-sm text-muted-foreground">
                The notices themselves come automatically from the dashboard notice page (Notices). Add, edit or delete a notice there and it appears on the home page notice board (only notices for "All" audience).
              </p>
            </CardContent>
          </Card>

          {/* ---------- Branches ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>Our branches</CardTitle>
              <CardDescription>Branch numbers (01, 02...) follow the order below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="Section heading (Our Branch)" value={page.branchesTitle || ""} onChange={(e) => setPage((p) => ({ ...p, branchesTitle: e.target.value }))} />
              {(page.branches || []).map((b, i) => (
                <div key={i} className="space-y-2 border-b pb-3">
                  <div className="flex gap-2">
                    <Input placeholder="Branch name" value={b.name || ""} onChange={(e) => setListItem("branches", i, { name: e.target.value })} />
                    <Input placeholder="Phone" className="w-48" value={b.phone || ""} onChange={(e) => setListItem("branches", i, { phone: e.target.value })} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeListItem("branches", i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input placeholder="Address" value={b.address || ""} onChange={(e) => setListItem("branches", i, { address: e.target.value })} />
                  <ImageField label="Branch photo" value={b.image} onChange={(u) => setListItem("branches", i, { image: u })} folder="branches" onError={err} />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => addListItem("branches", { name: "", address: "", phone: "", image: "" })}>
                <Plus className="h-4 w-4" /> Add branch
              </Button>
            </CardContent>
          </Card>

          {/* ---------- Footer ---------- */}
          <Card>
            <CardHeader>
              <CardTitle>Footer</CardTitle>
              <CardDescription>Big green footer at the bottom of the home page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <ImageField label="Background image (optional)" value={page.footer?.backgroundImage} onChange={(u) => setField("footer", "backgroundImage", u)} folder="footer" onError={err} />

              <div className="space-y-2">
                <Label>Top links (Get Appointment, Contact Us Today, Take a School Tour...)</Label>
                <LinkList items={page.footer?.actions} onChange={(l) => setNestedList("footer", "actions", l)} />
              </div>

              <div className="space-y-2">
                <Label>About column</Label>
                <Input placeholder="Heading (About us)" value={page.footer?.aboutTitle || ""} onChange={(e) => setField("footer", "aboutTitle", e.target.value)} />
                <Textarea rows={4} placeholder="About text" value={page.footer?.aboutText || ""} onChange={(e) => setField("footer", "aboutText", e.target.value)} />
                <div className="flex gap-2">
                  <Input placeholder="Button text (Contact us)" value={page.footer?.aboutButtonText || ""} onChange={(e) => setField("footer", "aboutButtonText", e.target.value)} />
                  <Input placeholder="Button link (#contact)" value={page.footer?.aboutButtonLink || ""} onChange={(e) => setField("footer", "aboutButtonLink", e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Important links</Label>
                <Input placeholder="Column heading (Important Link)" value={page.footer?.importantLinksTitle || ""} onChange={(e) => setField("footer", "importantLinksTitle", e.target.value)} />
                <LinkList items={page.footer?.importantLinks} onChange={(l) => setNestedList("footer", "importantLinks", l)} />
              </div>

              <div className="space-y-2">
                <Label>Services</Label>
                <Input placeholder="Column heading (Services)" value={page.footer?.servicesTitle || ""} onChange={(e) => setField("footer", "servicesTitle", e.target.value)} />
                <LinkList items={page.footer?.services} onChange={(l) => setNestedList("footer", "services", l)} />
              </div>

              <div className="space-y-2">
                <Label>Contact info blocks (phone, working hours, help line, email...)</Label>
                {(page.footer?.contactBlocks || []).map((c, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Input className="w-56" placeholder="Heading" value={c.label || ""} onChange={(e) => setNestedItem("footer", "contactBlocks", i, { label: e.target.value })} />
                    <Textarea rows={2} placeholder="Text (one item per line)" value={c.value || ""} onChange={(e) => setNestedItem("footer", "contactBlocks", i, { value: e.target.value })} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setNestedList("footer", "contactBlocks", (page.footer?.contactBlocks || []).filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setNestedList("footer", "contactBlocks", [...(page.footer?.contactBlocks || []), { label: "", value: "" }])}>
                  <Plus className="h-4 w-4" /> Add block
                </Button>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={page.footer?.showVisitorCounter !== false} onChange={(e) => setField("footer", "showVisitorCounter", e.target.checked)} />
                Show visitor counter
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="Facebook link" value={page.footer?.facebook || ""} onChange={(e) => setField("footer", "facebook", e.target.value)} />
                <Input placeholder="Twitter link" value={page.footer?.twitter || ""} onChange={(e) => setField("footer", "twitter", e.target.value)} />
                <Input placeholder="LinkedIn link" value={page.footer?.linkedin || ""} onChange={(e) => setField("footer", "linkedin", e.target.value)} />
                <Input placeholder="YouTube link" value={page.footer?.youtube || ""} onChange={(e) => setField("footer", "youtube", e.target.value)} />
              </div>

              <Input placeholder="Copyright line (© 2026 ..., All Rights Reserved)" value={page.footer?.copyright || ""} onChange={(e) => setField("footer", "copyright", e.target.value)} />
              <Input placeholder="Second line (Powered by ...)" value={page.footer?.poweredBy || ""} onChange={(e) => setField("footer", "poweredBy", e.target.value)} />
            </CardContent>
          </Card>

          {/* Sticky save bar: always visible at the bottom of the screen. Colours are explicit because landing.css
              redefines --primary and makes the default (bg-primary) Button invisible. */}
          <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t bg-white/95 px-4 py-3 backdrop-blur dark:bg-gray-900/95">
            <p className="text-xs text-muted-foreground">All sections on this page are saved together.</p>
            <Button onClick={save} disabled={saving} className="bg-green-600 text-white hover:bg-green-700">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

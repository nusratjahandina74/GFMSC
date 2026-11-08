import { useCallback, useEffect, useState } from "react";
import { Loader2, Star, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import MultiImageUploader from "./MultiImageUploader";
import { fetchAdminImages, uploadImages, updateImage, setCoverImage, deleteImage } from "../../api/media";

// Reusable admin screen for one image collection. kind = "slider" | "gallery".
export default function ImageCollectionManager({ kind, title, description }) {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState({ text: "", type: "success" });

  const say = (text, type = "success") => setMsg({ text, type });
  const errText = (err, fallback) => err?.response?.data?.message || fallback;

  // Re-fetch the list (used after upload / cover change). Cover comes first from the server.
  const load = useCallback(async () => {
    try {
      setImages(await fetchAdminImages(kind));
    } catch (err) {
      say(errText(err, "Could not load images."), "error");
    }
  }, [kind]);

  // First load
  useEffect(() => {
    let alive = true;
    fetchAdminImages(kind)
      .then((list) => alive && setImages(list))
      .catch((err) => alive && say(errText(err, "Could not load images."), "error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [kind]);

  const handleUpload = async (files, coverIndex, meta, onProgress) => {
    const res = await uploadImages(kind, files, { coverIndex, ...meta }, onProgress);
    say(`${res.count} image${res.count > 1 ? "s" : ""} uploaded.`);
    await load();
  };

  const toggleStatus = async (img) => {
    const next = img.status === "active" ? "inactive" : "active";
    setBusyId(img._id);
    setImages((list) => list.map((i) => (i._id === img._id ? { ...i, status: next } : i))); // optimistic
    try {
      await updateImage(kind, img._id, { status: next });
    } catch (err) {
      setImages((list) => list.map((i) => (i._id === img._id ? { ...i, status: img.status } : i))); // roll back
      say(errText(err, "Could not change the status."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const saveTitle = async (img, value) => {
    const clean = value.trim();
    if (clean === (img.title || "")) return;
    setBusyId(img._id);
    try {
      const saved = await updateImage(kind, img._id, { title: clean });
      setImages((list) => list.map((i) => (i._id === img._id ? { ...i, title: saved.title } : i)));
    } catch (err) {
      say(errText(err, "Could not save the title."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const makeCover = async (img) => {
    setBusyId(img._id);
    try {
      await setCoverImage(kind, img._id);
      say("Cover image updated.");
      await load(); // re-sort: cover first
    } catch (err) {
      say(errText(err, "Could not set the cover image."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (img) => {
    if (!window.confirm("Delete this image permanently? It will also be removed from Cloudinary.")) return;
    setBusyId(img._id);
    try {
      await deleteImage(kind, img._id);
      setImages((list) => list.filter((i) => i._id !== img._id));
      say("Image deleted.");
    } catch (err) {
      say(errText(err, "Could not delete the image."), "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {msg.text && (
        <div
          className={`rounded-md border p-3 text-sm ${
            msg.type === "error" ? "border-red-300 bg-red-50 text-red-700" : "border-green-300 bg-green-50 text-green-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upload new images</CardTitle>
          <CardDescription>Select up to 10 images, choose a cover, then press Upload.</CardDescription>
        </CardHeader>
        <CardContent>
          <MultiImageUploader onUpload={handleUpload} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uploaded images ({images.length})</CardTitle>
          <CardDescription>Only active images appear on the home page. The cover is always shown first.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : images.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No images uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Image</th>
                    <th className="py-2 pr-3">Title / caption</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Cover</th>
                    <th className="py-2 pr-3">Uploaded</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {images.map((img) => {
                    const active = img.status === "active";
                    const busy = busyId === img._id;
                    return (
                      <tr key={img._id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <img src={img.imageUrl} alt={img.title || ""} className="h-14 w-24 rounded-md border object-cover" />
                        </td>
                        <td className="py-2 pr-3">
                          <Input
                            key={`${img._id}-${img.title || ""}`}
                            defaultValue={img.title || ""}
                            maxLength={120}
                            placeholder="Add a caption"
                            className="h-8 min-w-[10rem]"
                            onBlur={(e) => saveTitle(img, e.target.value)}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={active}
                            aria-label={active ? "Set inactive" : "Set active"}
                            disabled={busy}
                            onClick={() => toggleStatus(img)}
                            className="inline-flex items-center gap-2 disabled:opacity-50"
                          >
                            <span className={`relative h-5 w-9 rounded-full transition-colors ${active ? "bg-green-600" : "bg-gray-300 dark:bg-gray-600"}`}>
                              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${active ? "left-[1.125rem]" : "left-0.5"}`} />
                            </span>
                            <Badge variant={active ? "success" : "secondary"}>{active ? "Active" : "Inactive"}</Badge>
                          </button>
                        </td>
                        <td className="py-2 pr-3">
                          {img.isCover ? (
                            <Badge variant="success">
                              <Star className="mr-1 h-3 w-3 fill-current" /> Cover
                            </Badge>
                          ) : (
                            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => makeCover(img)}>
                              <Star className="h-3.5 w-3.5" /> Make cover
                            </Button>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">{img.createdAt ? new Date(img.createdAt).toLocaleDateString() : "—"}</td>
                        <td className="py-2 text-right">
                          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => remove(img)}>
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import api from "./client";

// kind = "slider" | "gallery"  (matches the backend routes /api/slider and /api/gallery)

// ADMIN: every image of the logged-in school (active + inactive), cover first.
export const fetchAdminImages = async (kind) => {
  const res = await api.get(`/${kind}/admin`);
  return res.data?.images || [];
};

// PUBLIC: active images only, cover first. Used by the home page.
export const fetchPublicImages = async (kind, slug = "gfmsc") => {
  const res = await api.get(`/${kind}`, { params: { slug } });
  return res.data?.images || [];
};

// ADMIN: bulk upload (max 10). Sends multipart/form-data:
//   images[] (files), coverIndex (index of the cover file), title, description, status
export const uploadImages = async (kind, files, { coverIndex, title, description, status } = {}, onProgress) => {
  const fd = new FormData();
  files.forEach((file) => fd.append("images", file));
  if (Number.isInteger(coverIndex) && coverIndex >= 0) fd.append("coverIndex", String(coverIndex));
  if (title) fd.append("title", title);
  if (description) fd.append("description", description);
  if (status) fd.append("status", status);

  const res = await api.post(`/${kind}`, fd, {
    // The api client defaults to JSON; axios must be told this one is multipart (it adds the boundary itself).
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 300000,
    onUploadProgress: (e) => {
      if (e.total && onProgress) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  });
  return res.data; // { success, count, images }
};

export const updateImage = async (kind, id, patch) => (await api.patch(`/${kind}/${id}`, patch)).data.image;
export const setCoverImage = async (kind, id) => (await api.patch(`/${kind}/${id}/cover`)).data.image;
export const deleteImage = async (kind, id) => (await api.delete(`/${kind}/${id}`)).data;

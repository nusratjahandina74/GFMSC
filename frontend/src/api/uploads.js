import api from "./client";

// Uploads one image file to Cloudinary through the backend.
// Returns the permanent https URL (secure_url) to store in the database.
export const uploadImage = async (file, folder = "landing") => {
  const res = await api.post(`/uploads/image?folder=${encodeURIComponent(folder)}`, file, {
    headers: { "Content-Type": file.type },
    timeout: 60000,
  });
  return res.data; // { success, url, publicId }
};

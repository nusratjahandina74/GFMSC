import { v2 as cloudinary } from "cloudinary";

// Cloudinary SDK automatically reads CLOUDINARY_URL
// (cloudinary://API_KEY:API_SECRET@CLOUD_NAME). If you prefer three separate
// variables, set CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET.
if (!process.env.CLOUDINARY_URL && process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
} else {
  cloudinary.config({ secure: true });
}

export const isCloudinaryConfigured = () => {
  const c = cloudinary.config();
  return Boolean(c.cloud_name && c.api_key && c.api_secret);
};

export default cloudinary;

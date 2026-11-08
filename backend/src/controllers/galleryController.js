import Gallery from "../models/Gallery.js";
import { createImageController } from "./imageCollectionController.js";

export default createImageController(Gallery, { folder: "gallery", label: "gallery" });

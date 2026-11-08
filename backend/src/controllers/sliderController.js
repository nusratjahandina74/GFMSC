import Slider from "../models/Slider.js";
import { createImageController } from "./imageCollectionController.js";

export default createImageController(Slider, { folder: "slider", label: "slider" });

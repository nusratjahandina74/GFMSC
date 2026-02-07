import express from "express";
import { sendContactMessage } from "../controllers/contactController.js";

const router = express.Router();

// router.post("/", sendContactMessage);
router.get("/ping", (req, res) => res.json({ ok: true, msg: "contact route working" }));
export default router;

import express from "express";
import { sendContactMessage } from "../controllers/contactController.js";

const router = express.Router();


router.get("/ping", (req, res) => res.json({ ok: true, msg: "contact route working" }));
router.post("/", sendContactMessage);
export default router;

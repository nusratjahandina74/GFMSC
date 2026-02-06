import Notice from "../models/Notice.js";

export const listNotices = async (req, res) => {
  const filter = {};
  if (req.user?.schoolId) filter.schoolId = req.user.schoolId;

  const notices = await Notice.find(filter).sort({ publishDate: -1, createdAt: -1 });
  res.json(notices);
};

export const getNotice = async (req, res) => {
  const n = await Notice.findById(req.params.id);
  if (!n) return res.status(404).json({ message: "Notice not found" });
  res.json(n);
};

export const createNotice = async (req, res) => {
  const { title, body, tag, publishDate } = req.body;
  if (!title || !body) return res.status(400).json({ message: "title and body required" });

  const notice = await Notice.create({
    title,
    body,
    tag: tag || "Notice",
    publishDate: publishDate ? new Date(publishDate) : new Date(),
    schoolId: req.user?.schoolId,
    createdBy: req.user?._id,
  });

  res.status(201).json(notice);
};

export const updateNotice = async (req, res) => {
  const { title, body, tag, publishDate } = req.body;

  const n = await Notice.findById(req.params.id);
  if (!n) return res.status(404).json({ message: "Notice not found" });

  if (title !== undefined) n.title = title;
  if (body !== undefined) n.body = body;
  if (tag !== undefined) n.tag = tag;
  if (publishDate !== undefined) n.publishDate = new Date(publishDate);

  await n.save();
  res.json(n);
};

export const deleteNotice = async (req, res) => {
  const n = await Notice.findById(req.params.id);
  if (!n) return res.status(404).json({ message: "Notice not found" });

  await n.deleteOne();
  res.json({ message: "Deleted" });
};

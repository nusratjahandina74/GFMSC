import Staff from "../models/Staff.js";

export const listStaff = async (req, res) => {
  const filter = {};
  if (req.user?.schoolId) filter.schoolId = req.user.schoolId;
  const rows = await Staff.find(filter).sort({ createdAt: -1 });
  res.json(rows);
};

export const createStaff = async (req, res) => {
  const { name, phone, email, designation, address } = req.body;
  if (!name) return res.status(400).json({ message: "name required" });

  const row = await Staff.create({
    name, phone, email, designation, address,
    schoolId: req.user?.schoolId,
  });
  res.status(201).json(row);
};

export const updateStaff = async (req, res) => {
  const row = await Staff.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Staff not found" });

  Object.assign(row, req.body);
  await row.save();
  res.json(row);
};

export const deleteStaff = async (req, res) => {
  const row = await Staff.findById(req.params.id);
  if (!row) return res.status(404).json({ message: "Staff not found" });

  await row.deleteOne();
  res.json({ message: "Deleted" });
};

import Vehicle from "../models/Vehicle.js";
import TransportAssignment from "../models/TransportAssignment.js";
import Invoice from "../models/Invoice.js";

// ---------- Vehicles / Routes ----------

export const addVehicle = async (req, res) => {
  try {
    const { vehicleNumber, vehicleType, routeName, stoppages, driverName, driverPhone, capacity, monthlyFee } =
      req.body;
    if (!vehicleNumber || !routeName || monthlyFee === undefined) {
      return res.status(400).json({ message: "vehicleNumber, routeName and monthlyFee are required" });
    }
    const vehicle = await Vehicle.create({
      schoolId: req.user.schoolId,
      vehicleNumber,
      vehicleType,
      routeName,
      stoppages: stoppages || [],
      driverName,
      driverPhone,
      capacity,
      monthlyFee,
    });
    res.status(201).json({ message: "Vehicle/route added", vehicle });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const updateVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.user.schoolId },
      req.body,
      { new: true }
    );
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    res.json({ message: "Vehicle updated", vehicle });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const listVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ schoolId: req.user.schoolId }).sort({ routeName: 1 });
    res.json({ vehicles });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const deleteVehicle = async (req, res) => {
  try {
    const activeRiders = await TransportAssignment.countDocuments({
      schoolId: req.user.schoolId,
      vehicleId: req.params.id,
      isActive: true,
    });
    if (activeRiders > 0) {
      return res.status(400).json({ message: "Cannot delete a route that still has active riders" });
    }
    const vehicle = await Vehicle.findOneAndDelete({ _id: req.params.id, schoolId: req.user.schoolId });
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    res.json({ message: "Vehicle/route removed" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ---------- Student assignments ----------

export const assignStudent = async (req, res) => {
  try {
    const { studentId, vehicleId, pickupStoppage } = req.body;
    if (!studentId || !vehicleId) {
      return res.status(400).json({ message: "studentId and vehicleId are required" });
    }

    // Deactivate any existing active assignment for this student first —
    // a student rides exactly one route at a time.
    await TransportAssignment.updateMany(
      { schoolId: req.user.schoolId, studentId, isActive: true },
      { isActive: false }
    );

    const assignment = await TransportAssignment.create({
      schoolId: req.user.schoolId,
      studentId,
      vehicleId,
      pickupStoppage,
    });

    res.status(201).json({ message: "Student assigned to route", assignment });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const removeAssignment = async (req, res) => {
  try {
    const assignment = await TransportAssignment.findOneAndUpdate(
      { _id: req.params.id, schoolId: req.user.schoolId },
      { isActive: false },
      { new: true }
    );
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });
    res.json({ message: "Student removed from route" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

export const listAssignments = async (req, res) => {
  try {
    const { vehicleId } = req.query;
    const filter = { schoolId: req.user.schoolId, isActive: true };
    if (vehicleId) filter.vehicleId = vehicleId;
    const assignments = await TransportAssignment.find(filter)
      .populate("studentId", "studentName studentId className section")
      .populate("vehicleId", "vehicleNumber routeName monthlyFee");
    res.json({ assignments });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Generate this month's transport-fee invoices for every actively-assigned
// student, same bulk pattern as the tuition-fee cron.
export const generateMonthlyTransportInvoices = async (req, res) => {
  try {
    const monthKey = new Date().toISOString().slice(0, 7);
    const assignments = await TransportAssignment.find({ schoolId: req.user.schoolId, isActive: true }).populate(
      "vehicleId",
      "monthlyFee routeName"
    );

    const existing = await Invoice.find({
      schoolId: req.user.schoolId,
      month: monthKey,
      type: "other",
      description: { $regex: "^Transport Fee" },
    }).select("studentId");
    const alreadyInvoiced = new Set(existing.map((i) => i.studentId.toString()));

    const dueDate = new Date();
    dueDate.setDate(10);

    const newInvoices = assignments
      .filter((a) => a.vehicleId && !alreadyInvoiced.has(a.studentId.toString()))
      .map((a) => ({
        schoolId: req.user.schoolId,
        studentId: a.studentId,
        amount: a.vehicleId.monthlyFee,
        dueDate,
        month: monthKey,
        type: "other",
        description: `Transport Fee - ${a.vehicleId.routeName} (${monthKey})`,
        status: "pending",
      }));

    if (newInvoices.length > 0) {
      await Invoice.insertMany(newInvoices, { ordered: false });
    }

    res.json({ message: `Generated ${newInvoices.length} transport invoices for ${monthKey}` });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

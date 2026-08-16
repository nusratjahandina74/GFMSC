import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Plus, Bus, Trash2, Receipt } from "lucide-react";
import {
  getVehicles,
  addVehicle,
  deleteVehicle,
  getAssignments,
  assignStudent,
  removeAssignment,
  generateMonthlyTransportInvoices,
} from "../../api/transport";
import { getStudents } from "../../api/students";

export default function TransportPage() {
  const [tab, setTab] = useState("routes"); // "routes" | "assignments"
  const [vehicles, setVehicles] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [vOpen, setVOpen] = useState(false);
  const [vForm, setVForm] = useState({ vehicleNumber: "", vehicleType: "Bus", routeName: "", driverName: "", driverPhone: "", capacity: 40, monthlyFee: "" });

  const [aOpen, setAOpen] = useState(false);
  const [aForm, setAForm] = useState({ studentId: "", vehicleId: "", pickupStoppage: "" });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [v, a, s] = await Promise.all([getVehicles(), getAssignments(), getStudents({ limit: 500 })]);
      setVehicles(v.vehicles || []);
      setAssignments(a.assignments || []);
      setStudents(s.students || []);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    try {
      await addVehicle({ ...vForm, capacity: Number(vForm.capacity), monthlyFee: Number(vForm.monthlyFee) });
      setMsg("✅ Route/vehicle added");
      setVOpen(false);
      setVForm({ vehicleNumber: "", vehicleType: "Bus", routeName: "", driverName: "", driverPhone: "", capacity: 40, monthlyFee: "" });
      await loadAll();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  const handleDeleteVehicle = async (id) => {
    if (!window.confirm("Remove this route/vehicle?")) return;
    try {
      await deleteVehicle(id);
      setMsg("✅ Removed");
      await loadAll();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    try {
      await assignStudent(aForm);
      setMsg("✅ Student assigned to route");
      setAOpen(false);
      setAForm({ studentId: "", vehicleId: "", pickupStoppage: "" });
      await loadAll();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  const handleRemoveAssignment = async (id) => {
    if (!window.confirm("Remove this student from the route?")) return;
    try {
      await removeAssignment(id);
      setMsg("✅ Removed from route");
      await loadAll();
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  const handleGenerateInvoices = async () => {
    try {
      const res = await generateMonthlyTransportInvoices();
      setMsg(`✅ ${res.message}`);
    } catch (err) {
      setMsg(err?.response?.data?.message || err.message);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transport</h1>
          <p className="text-muted-foreground">Bus/van routes and student ridership</p>
        </div>
        <div className="flex gap-2">
          <Button variant={tab === "routes" ? "default" : "outline"} onClick={() => setTab("routes")}>Routes</Button>
          <Button variant={tab === "assignments" ? "default" : "outline"} onClick={() => setTab("assignments")}>Student Assignments</Button>
          <Button variant="secondary" className="gap-2" onClick={handleGenerateInvoices}>
            <Receipt className="h-4 w-4" /> Generate This Month's Fees
          </Button>
        </div>
      </div>

      {msg && (
        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-sm">{msg}</div>
      )}

      {tab === "routes" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Bus className="h-5 w-5" /> Routes ({vehicles.length})</CardTitle>
            <Dialog open={vOpen} onOpenChange={setVOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> Add Route</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Vehicle / Route</DialogTitle></DialogHeader>
                <form onSubmit={handleAddVehicle} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Vehicle Number *</Label>
                      <Input value={vForm.vehicleNumber} onChange={(e) => setVForm({ ...vForm, vehicleNumber: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={vForm.vehicleType} onValueChange={(v) => setVForm({ ...vForm, vehicleType: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Bus">Bus</SelectItem>
                          <SelectItem value="Van">Van</SelectItem>
                          <SelectItem value="Microbus">Microbus</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Route Name *</Label>
                    <Input placeholder="e.g. Mirpur - Uttara" value={vForm.routeName} onChange={(e) => setVForm({ ...vForm, routeName: e.target.value })} required />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Driver Name</Label>
                      <Input value={vForm.driverName} onChange={(e) => setVForm({ ...vForm, driverName: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Driver Phone</Label>
                      <Input value={vForm.driverPhone} onChange={(e) => setVForm({ ...vForm, driverPhone: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Capacity</Label>
                      <Input type="number" value={vForm.capacity} onChange={(e) => setVForm({ ...vForm, capacity: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Monthly Fee (৳) *</Label>
                      <Input type="number" value={vForm.monthlyFee} onChange={(e) => setVForm({ ...vForm, monthlyFee: e.target.value })} required />
                    </div>
                  </div>
                  <Button type="submit" className="w-full">Save Route</Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Monthly Fee</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((v) => (
                  <TableRow key={v._id}>
                    <TableCell className="font-medium">{v.vehicleNumber} ({v.vehicleType})</TableCell>
                    <TableCell>{v.routeName}</TableCell>
                    <TableCell>{v.driverName || "—"} {v.driverPhone && `(${v.driverPhone})`}</TableCell>
                    <TableCell>৳{v.monthlyFee}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteVehicle(v._id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && vehicles.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No routes yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {tab === "assignments" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Student Assignments ({assignments.length})</CardTitle>
            <Dialog open={aOpen} onOpenChange={setAOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> Assign Student</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Assign Student to Route</DialogTitle></DialogHeader>
                <form onSubmit={handleAssign} className="space-y-3">
                  <div className="space-y-2">
                    <Label>Student *</Label>
                    <Select value={aForm.studentId} onValueChange={(v) => setAForm({ ...aForm, studentId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                      <SelectContent>
                        {students.map((s) => (
                          <SelectItem key={s._id} value={s._id}>{s.studentName} — {s.className} {s.section}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Route *</Label>
                    <Select value={aForm.vehicleId} onValueChange={(v) => setAForm({ ...aForm, vehicleId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select route" /></SelectTrigger>
                      <SelectContent>
                        {vehicles.map((v) => (
                          <SelectItem key={v._id} value={v._id}>{v.routeName} — ৳{v.monthlyFee}/mo</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Pickup Stoppage</Label>
                    <Input value={aForm.pickupStoppage} onChange={(e) => setAForm({ ...aForm, pickupStoppage: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full">Assign</Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Pickup Point</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a._id}>
                    <TableCell>{a.studentId?.studentName} — {a.studentId?.className} {a.studentId?.section}</TableCell>
                    <TableCell>{a.vehicleId?.routeName}</TableCell>
                    <TableCell>{a.pickupStoppage || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveAssignment(a._id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && assignments.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No students assigned yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

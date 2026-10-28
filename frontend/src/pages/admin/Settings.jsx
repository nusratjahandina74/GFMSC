import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Loader2, School, ShieldAlert } from "lucide-react";
import { getMySchool, updateMySchool, setupMySchool } from "../../api/schools";

export default function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("success");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  const checkRoleDirectly = () => {
    const role = localStorage.getItem("role") || "";
    const userRaw = localStorage.getItem("user") || "";
    const authRaw = localStorage.getItem("auth") || "";

    if (
      role.toLowerCase().includes("super") || 
      userRaw.toLowerCase().includes("super") || 
      authRaw.toLowerCase().includes("super") ||
      window.location.pathname.includes("super")
    ) {
      return true;
    }
    return false;
  };

  const loadSchool = async () => {
    if (checkRoleDirectly()) {
      setIsSuperAdmin(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setMsg("");
    try {
      const res = await getMySchool();
      setFormData({
        name: res.school?.name || "",
        email: res.school?.email || "",
        phone: res.school?.phone || "",
        address: res.school?.address || "",
      });
      setNeedsSetup(false);
    } catch (err) {
      if (err?.response?.status === 404 || err?.response?.data?.needsSchoolSetup) {
        setNeedsSetup(true);
      } else {
        setMsgType("error");
        setMsg(err?.response?.data?.message || err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchool();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      if (needsSetup) {
        await setupMySchool(formData);
        setMsg("✅ School created and linked successfully.");
        setMsgType("success");
        setNeedsSetup(false);
        setTimeout(() => window.location.reload(), 1200);
      } else {
        await updateMySchool(formData);
        setMsg("✅ School info updated successfully");
        setMsgType("success");
      }
    } catch (err) {
      setMsgType("error");
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        Loading school info...
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage school settings</p>
        </div>
      </div>

      {isSuperAdmin ? (
        <Card className="border-red-200 dark:border-red-900/50">
          <CardHeader>
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <ShieldAlert className="h-6 w-6" />
              <CardTitle className="text-xl font-bold">Super Admin Access Restricted</CardTitle>
            </div>
            <CardDescription className="pt-1">
              This configuration form is strictly designated for individual School Administrators.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg border bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 text-sm">
              ℹ️ As a Super Admin, you manage global system architectures and global accounts. To modify parameters for a specific school, please authenticate via the respective school's dedicated <strong>School Admin Dashboard</strong>.
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {needsSetup && (
            <div className="p-4 rounded-lg border bg-yellow-50 text-yellow-800 border-yellow-200 flex gap-3 items-start mb-4">
              <School className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Your school isn't set up yet</p>
                <p className="text-sm mt-1">
                  Fill this form out once — until then, adding teachers, students, staff, routines,
                  attendance, exams, and marks will fail dashboard-wide.
                </p>
              </div>
            </div>
          )}

          {msg && (
            <div className={`p-4 rounded-lg border mb-4 ${msgType === "success" ? "bg-green-50 text-green-800 border-green-200" : "bg-red-50 text-red-800 border-red-200"}`}>
              {msg}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>School Information</CardTitle>
              <CardDescription>
                {needsSetup ? "Set up your school to activate the rest of the dashboard" : "Update school details"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
                <div className="space-y-2">
                  <Label>School Name</Label>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Glory Future Model School And College"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>School Email</Label>
                  <Input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="school@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="01XXXXXXXXX"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Textarea
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    placeholder="School address"
                    rows={3}
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-lg shadow-md flex items-center gap-2 transition-all disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {needsSetup ? "Create My School" : "Save Changes"}
                </button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

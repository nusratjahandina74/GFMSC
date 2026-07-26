import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { Loader2, School } from "lucide-react";
import { getMySchool, updateMySchool, setupMySchool } from "../../api/schools";

export default function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("success"); // "success" | "error"

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
  });

  const loadSchool = async () => {
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
        setMsg("✅ School created and linked to your account. You can now add teachers, students, staff, routines, exams and marks.");
        setMsgType("success");
        setNeedsSetup(false);
        // schoolId is now baked into a fresh token; reload so every page
        // (sidebar counts, dashboards, etc.) picks it up cleanly.
        setTimeout(() => window.location.reload(), 1200);
      } else {
        const res = await updateMySchool(formData);
        setMsg("✅ School info updated successfully");
        setMsgType("success");
        setFormData({
          name: res.school?.name || "",
          email: res.school?.email || "",
          phone: res.school?.phone || "",
          address: res.school?.address || "",
        });
      }
    } catch (err) {
      setMsgType("error");
      setMsg(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage school settings</p>
        </div>
      </div>

      {needsSetup && !loading && (
        <div className="p-4 rounded-lg border bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800 flex gap-3 items-start">
          <School className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Your school isn't set up yet</p>
            <p className="text-sm mt-1">
              Fill this form in once — until then, adding teachers, students, staff, routines,
              attendance, exams and marks will fail everywhere in the dashboard.
            </p>
          </div>
        </div>
      )}

      {msg && (
        <div className={`p-4 rounded-lg border ${msgType === "success" ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"}`}>
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
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              Loading school info...
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

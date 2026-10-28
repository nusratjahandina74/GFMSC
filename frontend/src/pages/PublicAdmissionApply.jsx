import { useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CheckCircle2 } from "lucide-react";
import { applyForAdmission } from "../api/admissions";

const CLASS_LIST = [
  "Play", "Nursery", "KG", "Class 1", "Class 2", "Class 3", "Class 4", "Class 5",
  "Class 6", "Class 7", "Class 8", "Class 9", "Class 10",
];

export default function PublicAdmissionApply() {
  const { schoolId } = useParams();
  const [form, setForm] = useState({
    applicantName: "",
    dateOfBirth: "",
    appliedForClass: "",
    sessionYear: new Date().getFullYear().toString(),
    fathersName: "",
    fathersPhone: "",
    mothersName: "",
    mothersPhone: "",
    address: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(null);

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await applyForAdmission(schoolId, form);
      setSuccess(res);
    } catch (err) {
      setError(err?.response?.data?.message || "Could not submit application. Please check the link and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto" />
            <h2 className="text-xl font-bold">Application Submitted!</h2>
            <p className="text-muted-foreground text-sm">
              {success.message}
            </p>
            <p className="text-xs text-muted-foreground">Reference ID: {success.applicationId}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4 py-10">
      <Card className="max-w-xl w-full">
        <CardHeader>
          <CardTitle className="text-2xl">Admission Application</CardTitle>
          <p className="text-muted-foreground text-sm">Fill out this form to apply for admission.</p>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Applicant's Full Name *</Label>
              <Input value={form.applicantName} onChange={handleChange("applicantName")} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date of Birth</Label>
                <Input type="date" value={form.dateOfBirth} onChange={handleChange("dateOfBirth")} />
              </div>
              <div className="space-y-2">
                <Label>Applying For Class *</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.appliedForClass}
                  onChange={handleChange("appliedForClass")}
                  required
                >
                  <option value="">Select class</option>
                  {CLASS_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Session Year *</Label>
              <Input value={form.sessionYear} onChange={handleChange("sessionYear")} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Father's Name *</Label>
                <Input value={form.fathersName} onChange={handleChange("fathersName")} required />
              </div>
              <div className="space-y-2">
                <Label>Father's Phone *</Label>
                <Input value={form.fathersPhone} onChange={handleChange("fathersPhone")} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mother's Name</Label>
                <Input value={form.mothersName} onChange={handleChange("mothersName")} />
              </div>
              <div className="space-y-2">
                <Label>Mother's Phone</Label>
                <Input value={form.mothersPhone} onChange={handleChange("mothersPhone")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={handleChange("address")} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit Application"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

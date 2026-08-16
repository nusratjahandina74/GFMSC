import { useState, useEffect, useContext } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Loader2, User, Lock, Eye, EyeOff } from "lucide-react";
import api from "../api/client";
import { AuthContext } from "../App";

export default function ProfileSettings() {
  const { user, setUser } = useContext(AuthContext) || {};
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("success");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [profileData, setProfileData] = useState({
    name: "",
    email: "",
    studentId: "",
    phone: "",
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });

  const loadProfile = async () => {
    setLoading(true);
    setMsg("");
    try {
      const res = await api.get("/manage/profile");
      const fetchedUser = res.data?.user || {};
      setProfileData({
        name: fetchedUser.name || "",
        email: fetchedUser.email || "",
        studentId: fetchedUser.studentId || "",
        phone: fetchedUser.phone || "",
      });
      if (setUser && fetchedUser.name) {
        const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
        const updated = { ...currentUser, ...fetchedUser };
        localStorage.setItem("user", JSON.stringify(updated));
        setUser(updated);
      }
    } catch (err) {
      setMsgType("error");
      const msg = err?.response?.data?.message || err?.message || "Failed to load profile";
      setMsg(msg);
      console.error("[ProfileSettings] Load profile error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleProfileChange = (e) => {
    setProfileData({ ...profileData, [e.target.name]: e.target.value });
  };

  const handlePasswordChange = (e) => {
    setPasswordData({ ...passwordData, [e.target.name]: e.target.value });
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const payload = { name: profileData.name.trim() };
      if (profileData.phone !== undefined) {
        payload.phone = profileData.phone.trim();
      }
      const res = await api.patch("/manage/profile", payload);
      const updatedUser = res.data?.user || { ...user, name: profileData.name, phone: profileData.phone };
      const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
      const nextUser = { ...currentUser, name: updatedUser.name, phone: updatedUser.phone || profileData.phone };
      localStorage.setItem("user", JSON.stringify(nextUser));
      if (setUser) setUser(nextUser);

      setMsg("Profile updated successfully");
      setMsgType("success");
    } catch (err) {
      setMsgType("error");
      const msg = err?.response?.data?.message || err?.message || "Failed to update profile";
      setMsg(msg);
      console.error("[ProfileSettings] Update profile error:", err);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    if (!passwordData.currentPassword) {
      setMsgType("error");
      setMsg("Current password is required");
      return;
    }
    if (!passwordData.newPassword) {
      setMsgType("error");
      setMsg("New password is required");
      return;
    }
    if (passwordData.newPassword.length < 6) {
      setMsgType("error");
      setMsg("New password must be at least 6 characters");
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmNewPassword) {
      setMsgType("error");
      setMsg("Passwords do not match");
      return;
    }
    setChangingPassword(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      setMsg("Password changed successfully");
      setMsgType("success");
      setPasswordData({ currentPassword: "", newPassword: "", confirmNewPassword: "" });
    } catch (err) {
      setMsgType("error");
      const msg = err?.response?.data?.message || err?.message || "Failed to change password";
      setMsg(msg);
      console.error("[ProfileSettings] Change password error:", err);
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
        <p className="text-muted-foreground">Manage your profile and password</p>
      </div>

      {msg && (
        <div
          className={`p-4 rounded-lg border ${msgType === "success" ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"}`}
        >
          {msg}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          Loading profile...
        </div>
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
              <CardDescription>
                Update your name and phone. Email and Student/Employee ID cannot be changed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSubmit} className="space-y-4 max-w-lg">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    name="name"
                    value={profileData.name}
                    onChange={handleProfileChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    name="email"
                    value={profileData.email}
                    disabled
                    className="opacity-70"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    name="phone"
                    type="tel"
                    value={profileData.phone}
                    onChange={handleProfileChange}
                    placeholder="e.g. +8801XXXXXXXXX"
                  />
                </div>
                {profileData.studentId && (
                  <div className="space-y-2">
                    <Label>Student ID</Label>
                    <Input
                      name="studentId"
                      value={profileData.studentId}
                      disabled
                      className="opacity-70"
                    />
                  </div>
                )}
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Change Password
              </CardTitle>
              <CardDescription>
                Update your password to keep your account secure.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-lg">
                <div className="space-y-2">
                  <Label>Current Password</Label>
                  <div className="relative">
                    <Input
                      type={showCurrentPassword ? "text" : "password"}
                      name="currentPassword"
                      value={passwordData.currentPassword}
                      onChange={handlePasswordChange}
                      className="pr-11"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((v) => !v)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                      aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="relative">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      name="newPassword"
                      value={passwordData.newPassword}
                      onChange={handlePasswordChange}
                      className="pr-11"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                      aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      name="confirmNewPassword"
                      value={passwordData.confirmNewPassword}
                      onChange={handlePasswordChange}
                      className="pr-11"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      tabIndex={-1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
                      aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={changingPassword}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {changingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Change Password
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

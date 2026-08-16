import apiClient from "./client";

// These return raw PDF binary, so we ask axios for a blob and hand the
// caller back an object URL it can open in a new tab / trigger a download
// with — same pattern used for report cards elsewhere in the app.
const openPdfBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => window.URL.revokeObjectURL(url), 10000);
};

export const downloadStudentIdCard = async (studentId, studentLabel = "student") => {
  const res = await apiClient.get(`/id-cards/student/${studentId}`, { responseType: "blob" });
  openPdfBlob(res.data, `idcard-${studentLabel}.pdf`);
};

export const downloadClassIdCardSheet = async (className, section) => {
  const res = await apiClient.get(`/id-cards/class-sheet`, {
    params: { className, section },
    responseType: "blob",
  });
  openPdfBlob(res.data, `idcards-${className}${section ? "-" + section : ""}.pdf`);
};

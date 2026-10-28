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

// When a blob-typed request fails, the server's JSON error body ({message})
// arrives as a Blob too (axios doesn't know to parse it as JSON when
// responseType is "blob"), so err.response.data.message is always
// undefined and every failure showed the same generic fallback text no
// matter what actually went wrong on the backend. This reads the blob's
// text and parses it so the real error reaches the UI.
const extractBlobErrorMessage = async (err, fallback) => {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);
      return parsed?.message || fallback;
    } catch {
      return fallback;
    }
  }
  return err?.response?.data?.message || err?.message || fallback;
};

export const downloadStudentIdCard = async (studentId, studentLabel = "student") => {
  try {
    const res = await apiClient.get(`/id-cards/student/${studentId}`, { responseType: "blob" });
    openPdfBlob(res.data, `idcard-${studentLabel}.pdf`);
  } catch (err) {
    const message = await extractBlobErrorMessage(err, "Could not generate ID card");
    throw new Error(message);
  }
};

export const downloadClassIdCardSheet = async (className, section) => {
  try {
    const res = await apiClient.get(`/id-cards/class-sheet`, {
      params: { className, section },
      responseType: "blob",
    });
    openPdfBlob(res.data, `idcards-${className}${section ? "-" + section : ""}.pdf`);
  } catch (err) {
    const message = await extractBlobErrorMessage(err, "Could not generate ID card sheet");
    throw new Error(message);
  }
};

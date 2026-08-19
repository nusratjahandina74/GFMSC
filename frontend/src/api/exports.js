import api from "./client";

// When a blob-typed request fails, the server's JSON error body arrives as
// a Blob too (axios doesn't parse it as JSON when responseType is "blob"),
// so err.response.data.message would always be undefined. This reads the
// blob's text and parses it so the real backend error message surfaces
// instead of a generic fallback.
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

// Downloads a CSV (opens directly in Excel, or File > Import > Upload in
// Google Sheets) of students, filtered by whatever's currently selected on
// the Students page (session year / class / section). Uses responseType:
// "blob" since this is a file download, not JSON — a plain GET through the
// normal client would otherwise try to parse the CSV bytes as JSON and
// fail silently.
export const exportStudentsCSV = async ({ sessionYear, className, section } = {}) => {
  const params = {};
  if (sessionYear) params.sessionYear = sessionYear;
  if (className) params.className = className;
  if (section) params.section = section;

  try {
    const response = await api.get("/export/students", {
      params,
      responseType: "blob",
    });

    const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = blobUrl;
    const filenameParts = ["students", sessionYear, className, section].filter(Boolean);
    link.setAttribute("download", `${filenameParts.join("-")}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    const message = await extractBlobErrorMessage(err, "Failed to export students");
    throw new Error(message);
  }
};

export const exportAttendanceCSV = async ({ month }) => {
  try {
    const response = await api.get("/export/attendance", {
      params: { month },
      responseType: "blob",
    });

    const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.setAttribute("download", `attendance-${month}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    const message = await extractBlobErrorMessage(err, "Failed to export attendance");
    throw new Error(message);
  }
};

// Tiny CSV parser (no dependency). Handles quoted fields, "" escapes, CRLF and a UTF-8 BOM,
// so Bangla text exported from Excel ("CSV UTF-8") imports correctly.
export function parseCSV(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

// Header names are matched loosely: "Title", "book title", "Total Copies", "copies", "Shelf/Rack No" ...
const ALIASES = {
  title: ["title", "booktitle", "name", "bookname"],
  author: ["author", "writer"],
  isbn: ["isbn", "isbnno"],
  category: ["category", "type"],
  totalCopies: ["totalcopies", "copies", "quantity", "qty", "total"],
  shelfLocation: ["shelf", "shelfno", "rack", "rackno", "shelfrackno", "shelflocation", "location"],
};
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// rows[0] is the header row. Works for both CSV text and Excel sheets.
export function booksFromRows(rows) {
  if (!rows || rows.length < 2) return [];
  const header = rows[0].map(norm);
  const colOf = {};
  for (const [key, names] of Object.entries(ALIASES)) {
    const idx = header.findIndex((h) => names.includes(h));
    if (idx >= 0) colOf[key] = idx;
  }
  if (colOf.title === undefined) throw new Error('The file needs a "Title" column in the first row');
  return rows
    .slice(1)
    .map((r) => {
      const out = {};
      for (const [key, idx] of Object.entries(colOf)) out[key] = String(r[idx] ?? "").trim();
      return out;
    })
    .filter((b) => Object.values(b).some((v) => v !== ""));
}

export const booksFromCSV = (text) => booksFromRows(parseCSV(text));

// Accepts .csv or .xlsx. The Excel reader is loaded on demand so it never bloats the main bundle.
export async function booksFromFile(file) {
  const name = String(file?.name || "").toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return booksFromRows(await readSheet(file));
  }
  if (name.endsWith(".xls")) throw new Error("Old .xls files are not supported — save as .xlsx or CSV first");
  return booksFromCSV(await file.text());
}

export const BOOK_CSV_TEMPLATE =
  "Title,Author,ISBN,Category,Total Copies,Shelf/Rack No\n" +
  "Physics Class 9-10,NCTB,9789840000001,Academic,5,A-1\n";

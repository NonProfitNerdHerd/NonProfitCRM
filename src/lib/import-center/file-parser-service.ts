import Papa from "papaparse";
import * as XLSX from "xlsx";

export function parseCsvContent(csvText: string) {
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: true
  });
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0].message);
  }
  const headers = parsed.meta.fields ?? [];
  return {
    headers,
    rows: parsed.data,
    previewRows: parsed.data.slice(0, 10)
  };
}

export function parseExcelContent(buffer: ArrayBuffer, sheetName?: string) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const selectedSheet = sheetName && workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[selectedSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return {
    sheetNames: workbook.SheetNames,
    selectedSheet,
    headers,
    rows,
    previewRows: rows.slice(0, 10)
  };
}

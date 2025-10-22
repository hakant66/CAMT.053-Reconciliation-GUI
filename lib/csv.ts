export function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const rows: string[][] = [];
  let cur = ""; let inQuotes = false; let field: string[] = [];
  const pushField = () => { field.push(cur); cur = ""; };
  const pushRow = () => { rows.push(field); field = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]; const next = text[i + 1];
    if (ch === '"') { if (inQuotes && next === '"') { cur += '"'; i++; } else { inQuotes = !inQuotes; } }
    else if (ch === "," && !inQuotes) { pushField(); }
    else if ((ch === "\n" || ch === "\r") && !inQuotes) { if (ch === "\r" && next === "\n") i++; pushField(); pushRow(); }
    else { cur += ch; }
  }
  if (cur.length > 0 || field.length > 0) { pushField(); pushRow(); }
  while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1).map((r) => { const obj: Record<string, string> = {}; headers.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim())); return obj; });
  return { headers, rows: dataRows };
}

export function toCSV(headers: string[], rows: Record<string, any>[]): string {
  const esc = (v: any) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [headers.map(esc).join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h])).join(","));
  return lines.join("\n");
}


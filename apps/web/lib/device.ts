"use client";

export function deviceId(): string {
  let id = localStorage.getItem("xbb_device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("xbb_device", id);
  }
  return id;
}

export type SavedCompany = { id: string; name: string };

export function savedCompany(): SavedCompany | null {
  try {
    const raw = localStorage.getItem("xbb_company");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCompany(c: SavedCompany) {
  localStorage.setItem("xbb_company", JSON.stringify(c));
}

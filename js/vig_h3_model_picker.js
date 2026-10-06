import { api } from "../../scripts/api.js";
export const PICK_FOLDER_ROUTE = "/vig/models/pick_folder";
export const PICK_FOLDER_CONTROL_ROUTE = "/vig/models/pick_folder_control";
async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
export async function pickFolder(start, purpose = "models") {
  let response;
  try {
    response = await api.fetchApi(PICK_FOLDER_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: start || "", purpose }),
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      message:
        "Could not reach the ComfyUI server to open the folder dialog " +
        `(${err && err.message ? err.message : "network error"}).`,
    };
  }
  const data = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      message: (data && data.message) || `The server answered ${response.status}.`,
    };
  }
  return data || { ok: false, message: "The server answered with no body." };
}
export async function folderDialog(action) {
  try {
    const response = await api.fetchApi(PICK_FOLDER_CONTROL_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
      cache: "no-store",
    });
    return (await readJson(response)) || { ok: false };
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : "network error" };
  }
}

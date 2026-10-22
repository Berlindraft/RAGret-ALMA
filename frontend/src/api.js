export async function api(path, options = {}) {
  const response = await fetch("/api" + path, options);
  const value = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof value?.detail === "string"
        ? value.detail
        : "The request could not be completed. Please try again.",
    );
  return value;
}
export const post = (path, body = {}) =>
  api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const formatDate = (value) =>
  value
    ? new Date(value + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Date unknown";
export function download(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

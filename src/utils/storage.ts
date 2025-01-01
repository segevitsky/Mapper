import { uuidRegex } from "./urlUrils";

export function generateStoragePath(url: string): string {
  const urlObj = new URL(url);
  const search = urlObj.search;
  const pathname = urlObj.pathname;
  const params = new URLSearchParams(search);
  const tabValue = params.get("tab");

  const pathParts = pathname
    .split("/")
    .filter(Boolean)
    .filter((el) => el !== "/")
    .filter((el) => el !== "")
    .filter((el) => !uuidRegex.test(el));

  if (tabValue) {
    pathParts.push(tabValue);
  }

  return pathParts.join("_");
}

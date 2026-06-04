import { readFile } from "node:fs/promises";

const fallbackVersion = "0.1.0";

export const readPackageVersion = async (): Promise<string> => {
  try {
    const packageJsonUrl = new URL("../../package.json", import.meta.url);
    const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8"));

    if (typeof packageJson.version === "string" && packageJson.version.trim().length > 0) {
      return packageJson.version;
    }
  } catch {
    // Fall back to the checked-in version when package metadata is unavailable.
  }

  return fallbackVersion;
};

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type VersionState = {
  readonly lastSeenVersion?: string;
};

type VersionNoticeIo = {
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
};

export type VersionNoticeOptions = {
  readonly currentVersion: string;
  readonly io: VersionNoticeIo;
  readonly statePath?: string;
};

export const defaultVersionStatePath = (): string =>
  join(homedir(), ".config", "redash-cli", "state.json");

const readVersionState = async (statePath: string): Promise<VersionState> => {
  try {
    const text = await readFile(statePath, "utf8");
    const parsed = JSON.parse(text);

    if (
      parsed != null &&
      typeof parsed === "object" &&
      typeof parsed.lastSeenVersion === "string"
    ) {
      return { lastSeenVersion: parsed.lastSeenVersion };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return {};
    }
  }

  return {};
};

const writeVersionState = async (statePath: string, state: VersionState): Promise<void> => {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
};

export const notifyVersionChange = async ({
  currentVersion,
  io,
  statePath = defaultVersionStatePath(),
}: VersionNoticeOptions): Promise<void> => {
  const state = await readVersionState(statePath);

  if (state.lastSeenVersion === currentVersion) {
    return;
  }

  try {
    await writeVersionState(statePath, { lastSeenVersion: currentVersion });
  } catch {
    return;
  }

  if (state.lastSeenVersion != null) {
    io.stderr.write(
      `redash: upgraded to version ${currentVersion} (previously ${state.lastSeenVersion}).\n`,
    );
  }
};

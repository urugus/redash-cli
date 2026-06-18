import { createRequire } from "node:module";
import { password } from "@inquirer/prompts";
import { Command } from "commander";
import { ResultAsync } from "neverthrow";
import {
  normalizeRedashUrl,
  resolveProfile,
  setDefaultProfile,
  upsertProfile,
  validateProfileName,
} from "../config/config.js";
import { readConfigFile, writeConfigFile } from "../config/config-store.js";
import type { AppError } from "../errors/app-error.js";
import { readApiKey, saveApiKey } from "../keychain/keychain.js";
import { formatRows, parseOutputFormat } from "../output/format.js";
import { createRedashClient } from "../redash/client.js";
import {
  buildPostgresExplainSql,
  decodePostgresExplainRows,
  findPostgresDataSource,
} from "./explain.js";
import {
  type DashboardGetOptions,
  type DashboardListOptions,
  type QueryExplainOptions,
  type QueryRunOptions,
  type UserInviteOptions,
  validateDashboardGetOptions,
  validateDashboardListOptions,
  validateQueryExplainOptions,
  validateQueryRunOptions,
  validateUserInviteOptions,
} from "./validation.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as { version: string };

export type Io = {
  readonly stdout: Pick<NodeJS.WriteStream, "write">;
  readonly stderr: Pick<NodeJS.WriteStream, "write">;
};

export type PromptPassword = (message: string) => Promise<string>;

export type ProgramDeps = {
  readonly io?: Io;
  readonly promptPassword?: PromptPassword;
  readonly version?: string;
};

const printError = (io: Io, error: AppError): void => {
  io.stderr.write(`redash: ${error.message}\n`);
};

const loadProfile = (profileOption?: string) =>
  readConfigFile().andThen((config) => resolveProfile(config, profileOption));

const buildClientForProfile = (profileOption?: string) =>
  loadProfile(profileOption).andThen(({ name, url }) =>
    readApiKey(name).map((apiKey) => ({
      profile: name,
      client: createRedashClient({ baseUrl: url, apiKey }),
    })),
  );

const runTask = async <T>(
  io: Io,
  task: ResultAsync<T, AppError>,
  onSuccess: (value: T) => void,
): Promise<void> =>
  task.match(
    (value) => {
      onSuccess(value);
    },
    (error) => {
      printError(io, error);
      process.exitCode = 1;
    },
  );

const promptApiKey = (promptPassword: PromptPassword): ResultAsync<string, AppError> =>
  ResultAsync.fromPromise(
    promptPassword("Redash API key"),
    (cause) =>
      ({
        code: "validation_error",
        message: "Failed to read API key input.",
        cause,
      }) as AppError,
  );

export const createProgram = ({
  io = { stdout: process.stdout, stderr: process.stderr },
  promptPassword = (message) => password({ message, mask: "*" }),
  version = packageJson.version,
}: ProgramDeps = {}): Command => {
  const program = new Command();

  program.name("redash").description("Small Redash CLI").version(version);

  const config = program.command("config").description("Manage local Redash profiles");

  config
    .command("set")
    .requiredOption("--profile <profile>", "Profile name")
    .requiredOption("--url <url>", "Redash URL")
    .description("Set a Redash profile and save its API key in macOS Keychain")
    .action(async (options: { readonly profile: string; readonly url: string }) => {
      await runTask(
        io,
        validateProfileName(options.profile)
          .andThen((profile) => normalizeRedashUrl(options.url).map((url) => ({ profile, url })))
          .asyncAndThen(({ profile, url }) =>
            readConfigFile()
              .map((currentConfig) => upsertProfile(currentConfig, profile, url))
              .andThen((nextConfig) => writeConfigFile(nextConfig))
              .andThen(() => promptApiKey(promptPassword))
              .andThen((apiKey) => saveApiKey(profile, apiKey))
              .map(() => ({ profile })),
          ),
        ({ profile }) => {
          io.stdout.write(`Saved profile: ${profile}\n`);
        },
      );
    });

  config
    .command("list")
    .description("List Redash profiles without showing API keys")
    .action(async () => {
      await runTask(
        io,
        readConfigFile().map((storedConfig) => storedConfig),
        (storedConfig) => {
          const lines = Object.entries(storedConfig.profiles).map(([name, profile]) => {
            const marker = storedConfig.defaultProfile === name ? "*" : " ";
            return `${marker} ${name}\t${profile.url}`;
          });
          io.stdout.write(`${lines.join("\n")}${lines.length === 0 ? "" : "\n"}`);
        },
      );
    });

  config
    .command("use")
    .argument("<profile>", "Profile name")
    .description("Set default profile")
    .action(async (profile: string) => {
      await runTask(
        io,
        readConfigFile()
          .andThen((storedConfig) => setDefaultProfile(storedConfig, profile))
          .andThen((nextConfig) => writeConfigFile(nextConfig).map(() => profile)),
        (savedProfile) => {
          io.stdout.write(`Using profile: ${savedProfile}\n`);
        },
      );
    });

  const auth = program.command("auth").description("Redash authentication commands");

  auth
    .command("test")
    .option("--profile <profile>", "Profile name")
    .description("Test Redash API credentials")
    .action(async (options: { readonly profile?: string }) => {
      await runTask(
        io,
        buildClientForProfile(options.profile).andThen(({ profile, client }) =>
          client.testAuth().map(() => profile),
        ),
        (profile) => {
          io.stdout.write(`Authenticated: ${profile}\n`);
        },
      );
    });

  const dataSources = program.command("data-sources").description("Redash data source commands");

  dataSources
    .command("list")
    .option("--profile <profile>", "Profile name")
    .description("List Redash data sources")
    .action(async (options: { readonly profile?: string }) => {
      await runTask(
        io,
        buildClientForProfile(options.profile).andThen(({ client }) => client.listDataSources()),
        (sources) => {
          io.stdout.write(`${JSON.stringify(sources, null, 2)}\n`);
        },
      );
    });

  const dashboards = program.command("dashboards").description("Redash dashboard commands");

  dashboards
    .command("list")
    .option("--profile <profile>", "Profile name")
    .option("--page <page>", "Page number", "1")
    .option("--page-size <size>", "Dashboards per page, up to 250", "20")
    .option("--order <order>", "Sort order, for example --order=-created_at", "-created_at")
    .description("List Redash dashboards")
    .action(async (options: DashboardListOptions) => {
      await runTask(
        io,
        validateDashboardListOptions(options).asyncAndThen((validOptions) =>
          buildClientForProfile(validOptions.profile).andThen(({ client }) =>
            client.listDashboards({
              page: validOptions.page,
              pageSize: validOptions.pageSize,
              order: validOptions.order,
            }),
          ),
        ),
        (dashboardsResult) => {
          io.stdout.write(`${JSON.stringify(dashboardsResult, null, 2)}\n`);
        },
      );
    });

  dashboards
    .command("get")
    .argument("<slug>", "Dashboard slug")
    .option("--profile <profile>", "Profile name")
    .description("Get a Redash dashboard by slug")
    .action(async (slug: string, options: DashboardGetOptions) => {
      await runTask(
        io,
        validateDashboardGetOptions(slug, options).asyncAndThen((validOptions) =>
          buildClientForProfile(validOptions.profile).andThen(({ client }) =>
            client.getDashboard(validOptions.slug),
          ),
        ),
        (dashboard) => {
          io.stdout.write(`${JSON.stringify(dashboard, null, 2)}\n`);
        },
      );
    });

  const users = program.command("users").description("Redash user commands");

  users
    .command("invite")
    .requiredOption("--name <name>", "User display name")
    .requiredOption("--email <email>", "User email address")
    .option("--profile <profile>", "Profile name")
    .option("--no-send-email", "Create a pending invitation without sending an invitation email")
    .description("Invite a Redash user")
    .action(async (options: UserInviteOptions) => {
      await runTask(
        io,
        validateUserInviteOptions(options).asyncAndThen((validOptions) =>
          buildClientForProfile(validOptions.profile).andThen(({ client }) =>
            client.inviteUser({
              name: validOptions.name,
              email: validOptions.email,
              sendEmail: validOptions.sendEmail,
            }),
          ),
        ),
        (user) => {
          io.stdout.write(`${JSON.stringify(user, null, 2)}\n`);
        },
      );
    });

  const admin = program.command("admin").description("Redash admin commands");

  admin
    .command("queue-status")
    .option("--profile <profile>", "Profile name")
    .description("Show Redash query queue and worker status")
    .action(async (options: { readonly profile?: string }) => {
      await runTask(
        io,
        buildClientForProfile(options.profile).andThen(({ client }) =>
          client.getAdminQueueStatus(),
        ),
        (status) => {
          io.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
        },
      );
    });

  const query = program.command("query").description("Redash query commands");

  query
    .command("run")
    .requiredOption("--data-source-id <id>", "Data source id")
    .requiredOption("--sql <sql>", "SQL to run")
    .option("--profile <profile>", "Profile name")
    .option("--format <format>", "Output format: json or csv", "json")
    .description("Run ad-hoc SQL through Redash")
    .action(async (options: QueryRunOptions) => {
      await runTask(
        io,
        validateQueryRunOptions(options)
          .andThen((validOptions) =>
            parseOutputFormat(validOptions.format).map((format) => ({ ...validOptions, format })),
          )
          .asyncAndThen((validOptions) =>
            buildClientForProfile(validOptions.profile).andThen(({ client }) =>
              client.runQuery(validOptions.dataSourceId, validOptions.sql).map((rows) => ({
                rows,
                format: validOptions.format,
              })),
            ),
          ),
        ({ rows, format }) => {
          io.stdout.write(formatRows(rows, format));
        },
      );
    });

  query
    .command("explain")
    .requiredOption("--data-source-id <id>", "Data source id")
    .requiredOption("--sql <sql>", "SQL to explain")
    .option("--profile <profile>", "Profile name")
    .description("Run PostgreSQL EXPLAIN through Redash")
    .action(async (options: QueryExplainOptions) => {
      await runTask(
        io,
        validateQueryExplainOptions(options)
          .andThen((validOptions) =>
            buildPostgresExplainSql(validOptions.sql).map((explainSql) => ({
              ...validOptions,
              explainSql,
            })),
          )
          .asyncAndThen((validOptions) =>
            buildClientForProfile(validOptions.profile).andThen(({ client }) =>
              client
                .listDataSources()
                .andThen((sources) => findPostgresDataSource(sources, validOptions.dataSourceId))
                .andThen(() => client.runQuery(validOptions.dataSourceId, validOptions.explainSql))
                .andThen((rows) => decodePostgresExplainRows(rows)),
            ),
          ),
        (output) => {
          io.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
        },
      );
    });

  return program;
};

import { promises as fs } from "fs";
import path from "path";

type Variables = Record<string, unknown>;

type CliArgs = {
  template: string;
  vars: string;
  out: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith("--")) continue;
    const key = flag.slice(2) as keyof CliArgs;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for flag ${flag}`);
    }
    args[key] = value;
    i += 1;
  }

  const required: Array<keyof CliArgs> = ["template", "vars", "out"];
  const missing = required.filter((key) => !args[key]);
  if (missing.length) {
    throw new Error(`Missing required arguments: ${missing.join(", ")}`);
  }

  return args as CliArgs;
}

function collectPlaceholders(template: string): string[] {
  const regex = /{{\s*([A-Za-z0-9_.-]+)\s*}}/g;
  const keys = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) {
    keys.add(match[1]);
  }
  return Array.from(keys);
}

function toSafeString(value: unknown): string {
  if (value === null || value === undefined) {
    throw new Error("Variable value is null or undefined");
  }

  let strValue: string;
  if (typeof value === "object") {
    strValue = JSON.stringify(value);
  } else {
    strValue = String(value);
  }

  // JSON.stringify escapes characters that would break JSON string literals.
  const escaped = JSON.stringify(strValue);
  return escaped.slice(1, -1);
}

function renderTemplate(template: string, variables: Variables): string {
  const placeholders = collectPlaceholders(template);
  const missing = placeholders.filter((key) => !(key in variables));

  if (missing.length) {
    throw new Error(`Missing variables for placeholders: ${missing.join(", ")}`);
  }

  // First, replace full JSON string placeholders ("{{key}}") with typed JSON values.
  // This preserves arrays/objects/numbers/booleans instead of forcing string form.
  const quotedRegex = /"{{\s*([A-Za-z0-9_.-]+)\s*}}"/g;
  const withTypedValues = template.replace(quotedRegex, (_, key: string) => {
    const value = variables[key];
    if (value === null || value === undefined) {
      throw new Error(`Variable value is null or undefined for key: ${key}`);
    }
    return JSON.stringify(value);
  });

  // Then replace any remaining inline placeholders inside strings.
  const regex = /{{\s*([A-Za-z0-9_.-]+)\s*}}/g;
  return withTypedValues.replace(regex, (_, key: string) => {
    const value = variables[key];
    return toSafeString(value);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const [templatePath, varsPath, outPath] = [
    path.resolve(args.template),
    path.resolve(args.vars),
    path.resolve(args.out),
  ];

  const [template, varsRaw] = await Promise.all([
    fs.readFile(templatePath, "utf8"),
    fs.readFile(varsPath, "utf8"),
  ]);

  let variables: Variables;
  try {
    variables = JSON.parse(varsRaw) as Variables;
  } catch (error) {
    throw new Error(`Failed to parse vars file: ${String(error)}`);
  }

  const rendered = renderTemplate(template, variables);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, rendered, "utf8");
  // eslint-disable-next-line no-console
  console.log(`Rendered workflow written to ${outPath}`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

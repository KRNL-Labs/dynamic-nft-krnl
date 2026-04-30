import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

export type WorkflowType =
  | "mint"
  | "quest_reward"
  | "lootbox"
  | "set_active_traits"
  | "set_base_uri";

const TEMPLATE_FILES: Record<WorkflowType, string[]> = {
  mint: ["mint-base-nft.json", "mint_base_nft.workflow.json"],
  quest_reward: ["quest_reward.workflow.json", "quest-reward.json"],
  lootbox: ["open-lootbox.json", "open_lootbox.workflow.json"],
  set_active_traits: [
    "activate-traits.json",
    "set-active-traits.json",
    "set_active_traits.workflow.json"
  ],
  set_base_uri: ["set_metadata_base_uri.workflow.json", "set-metadata-base-uri.json"]
};

const getTemplatesDir = () => {
  const dir = process.env.WORKFLOW_TEMPLATES_DIR;
  if (dir && dir.trim()) {
    return path.resolve(dir);
  }

  const candidates = [
    path.resolve(process.cwd(), "packages/workflows/workflows"),
    path.resolve(process.cwd(), "../../packages/workflows/workflows"),
    path.resolve(__dirname, "../../../../packages/workflows/workflows")
  ];

  return candidates.find((candidate) => fsSync.existsSync(candidate)) || candidates[0];
};


const collectPlaceholders = (template: string): string[] => {
  const regex = /{{\s*([A-Za-z0-9_.-]+)\s*}}/g;
  const keys = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) {
    keys.add(match[1]);
  }
  return Array.from(keys);
};

const replacePlaceholders = (
  template: string,
  variables: Record<string, string | number | boolean>
): string => {
  const regex = /{{\s*([A-Za-z0-9_.-]+)\s*}}/g;
  return template.replace(regex, (match, key, offset, full) => {
    if (!(key in variables)) {
      return match;
    }
    const value = variables[key];
    const prevChar = full[offset - 1];
    const nextChar = full[offset + match.length];
    const surroundedByQuotes = prevChar === '"' && nextChar === '"';

    if (typeof value === "string") {
      const escaped = JSON.stringify(value);
      return surroundedByQuotes ? escaped.slice(1, -1) : escaped;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    throw new Error(`Invalid variable type for ${key}`);
  });
};

const renderTemplateAtPath = async (
  templatePath: string,
  variables: Record<string, string | number | boolean>
) => {
  const templateText = await fs.readFile(templatePath, "utf8");

  const placeholders = collectPlaceholders(templateText);
  const missing = placeholders.filter((key) => !(key in variables));
  if (missing.length > 0) {
    throw new Error(`Missing variables: ${missing.join(", ")}`);
  }

  const renderedText = replacePlaceholders(templateText, variables);
  let renderedJson: unknown;
  try {
    renderedJson = JSON.parse(renderedText);
  } catch (err) {
    throw new Error(`Rendered template is not valid JSON: ${(err as Error).message}`);
  }

  return { renderedJson, renderedText, templatePath };
};

export const renderWorkflowTemplate = async ({
  type,
  variables
}: {
  type: WorkflowType;
  variables: Record<string, string | number | boolean>;
}): Promise<{ renderedJson: unknown; renderedText: string; templatePath: string }> => {
  const dir = getTemplatesDir();
  const candidates = TEMPLATE_FILES[type].map((file) => path.join(dir, file));
  for (const templatePath of candidates) {
    try {
      await fs.access(templatePath);
      return renderTemplateAtPath(templatePath, variables);
    } catch {
      // keep trying next candidate
    }
  }
  throw new Error(
    `Workflow template not found for ${type}. Checked: ${candidates.join(", ")}`
  );
};

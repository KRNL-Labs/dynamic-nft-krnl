const fs = require("fs");
const path = require("path");

const workflowsDir = path.join(__dirname, "..", "workflows");
const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith(".json"));

const errors = [];

for (const file of files) {
  const fullPath = path.join(workflowsDir, file);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (err) {
    errors.push(`${file}: invalid JSON (${err.message})`);
    continue;
  }

  const workflow = data.workflow;
  if (!workflow || typeof workflow !== "object") {
    errors.push(`${file}: missing workflow object`);
    continue;
  }

  if (!workflow.name || typeof workflow.name !== "string") {
    errors.push(`${file}: workflow.name missing or not a string`);
  }
  if (!workflow.version || typeof workflow.version !== "string") {
    errors.push(`${file}: workflow.version missing or not a string`);
  }
  if (!Array.isArray(workflow.steps)) {
    errors.push(`${file}: workflow.steps missing or not an array`);
    continue;
  }

  workflow.steps.forEach((step, idx) => {
    if (!step || typeof step !== "object") {
      errors.push(`${file}: step[${idx}] is not an object`);
      return;
    }
    if (!step.name || typeof step.name !== "string") {
      errors.push(`${file}: step[${idx}].name missing or not a string`);
    }
    if (!step.image || typeof step.image !== "string") {
      errors.push(`${file}: step[${idx}].image missing or not a string`);
    }
  });
}

if (errors.length) {
  console.error("Workflow validation failed:");
  for (const err of errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
} else {
  console.log(`Workflow validation passed (${files.length} files checked).`);
}

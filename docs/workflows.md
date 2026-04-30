# Workflows

Workflow templates live in `packages/workflows/workflows` and are the single source of truth for KRNL submissions.

The API renders templates with runtime values, records workflow runs, submits to the KRNL node when configured, and polls status where supported. Demo mode can record queued/submitted runs without requiring live KRNL submission if the current code path supports that bypass.

Validate templates with:

```sh
pnpm workflows:validate
```

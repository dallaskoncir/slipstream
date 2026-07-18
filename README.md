# scrutineer

[![npm version](https://img.shields.io/npm/v/@flowlaps/scrutineer)](https://www.npmjs.com/package/@flowlaps/scrutineer)

Scrutineer is an autonomous, sandboxed CLI that reviews the TypeScript files in your pull request before you merge — so you get a real code-review and security-audit pass, plus a sandboxed smoke test, without waiting on a human reviewer or shipping your diff to some black-box SaaS.

## Key Features

- **AST-grounded context, not just a raw diff.** `ts-morph` parses the target file and extracts exported function signatures, imports, and interfaces into a compact summary, so the model reviews structured facts about the file instead of guessing from text.
- **Layered agent personas.** Each file goes through a `code-reviewer` pass and then a `security-auditor` pass, using pinned, hash-verified persona prompts sourced from Addy Osmani's `agent-skills` repository — see [`docs/decisions/0003-pin-and-hash-verify-persona-prompts.md`](docs/decisions/0003-pin-and-hash-verify-persona-prompts.md) for why they're pinned.
- **Air-gapped local model support.** `--provider ollama` runs the entire pipeline against a local Ollama model, so nothing leaves your machine. Scrutineer warns on stderr if `OLLAMA_HOST` resolves off loopback, since that means review content is going somewhere other than your own box.
- **`isolated-vm` secure sandbox.** The model also generates a small smoke test for the file, which runs inside an ephemeral V8 isolate with a bounded memory limit, an execution timeout, and zero filesystem, network, or Node built-in access. It runs in parallel with the review passes, and a script that blows past its budget gets its failure captured, not left to crash the process.
- **Diffs get scrubbed before they leave your machine.** Anything that looks like an API key, token, or private key block is redacted out of the diff before it's included in a prompt.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full data flow.

## Quick Start

```bash
# install
npm install -g @flowlaps/scrutineer

# set your API key for this shell session
export ANTHROPIC_API_KEY=sk-ant-...

# review a file
scrutineer review ./src/index.ts
```

Or skip the install and run it straight from the registry:

```bash
npx @flowlaps/scrutineer review ./src/index.ts
```

Prefer a fully offline setup? Install Ollama, pull a model, then point scrutineer at it — no API key needed:

```bash
ollama pull phi4
scrutineer review ./src/index.ts --provider ollama
```

Other useful flags:

```bash
scrutineer review ./src/index.ts --output review.md   # write the report to a file
scrutineer review ./src/index.ts --pr 42               # post the report as a PR comment
scrutineer parse ./src/index.ts --json                 # just the AST extraction, no model call
```

> Scrutineer reviews one file at a time — for a whole MR, run it once per changed file.

## Configuration

Scrutineer reads all credentials and overrides from environment variables in whatever shell or CI job it's running in. There's no config file — set what you need before invoking the CLI.

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes, for `--provider anthropic` (the default) | API key used to call Claude. Not needed with `--provider ollama`. |
| `GITHUB_TOKEN` | Only for `scrutineer review --pr <number>` | Personal access token with permission to comment on the repo's PRs. |
| `OLLAMA_HOST` | No | Overrides the Ollama server address (defaults to `http://127.0.0.1:11434`). Scrutineer warns on stderr if this isn't a loopback address, since review content is sent to whatever host it points at. |
| `SCRUTINEER_MODEL_ANTHROPIC` | No | Overrides the default Anthropic model (`claude-sonnet-5`). |
| `SCRUTINEER_MODEL_OLLAMA` | No | Overrides the default Ollama model (auto-detected from what's running locally, falling back to `phi4`). |

**Local shell** — export vars directly, or drop them in a `.env` file (copy `.env.example` to `.env` and fill it in):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export GITHUB_TOKEN=ghp_...
```

**GitHub Actions** — set them in the job's `env` block, backed by repo/org secrets:

```yaml
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx @flowlaps/scrutineer review ./src/index.ts --pr ${{ github.event.pull_request.number }}
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Troubleshooting

**pnpm (v10+):** Scrutineer depends on `isolated-vm`, which compiles a native C++ addon during install. Modern pnpm blocks native build scripts by default for security reasons, so after `pnpm install` you'll need to explicitly approve it:

```bash
pnpm approve-builds
```

and allow `isolated-vm` to compile. Without this step, the sandbox will fail to load.

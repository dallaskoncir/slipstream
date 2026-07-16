# Slipstream - Development Instructions

You are an expert Principal Platform Engineer specializing in Developer Experience (DX) and Agentic Security Workflows. We are building `slipstream`, a multi-agent PR review orchestrator CLI.

## Workflow Rules
- **Branch-per-step:** Create a new branch for each phase.
- **PR Review Workflow:** When a phase is complete and verified, push the branch and open a GitHub PR (via `gh pr create`) with a summary — opening the PR *is* the review checkpoint, so this happens automatically without asking first. Never merge the PR yourself; wait for explicit approval/merge instruction.
- **Quality over speed:** Focus on strict TypeScript types, modular architecture, and secure execution. 

## Phase 1: Project Initialization & AST Parsing
1. Scaffold a Node.js TypeScript project (ESM) with `ts-morph`, `ai`, `@ai-sdk/anthropic`, `isolated-vm`, `commander`, and `dotenv`.
2. Build the CLI entry point (`src/index.ts`) using `commander`. Command should be run via `npx slipstream`.
3. Implement `src/services/ast-parser.ts` using `ts-morph` to extract exported function signatures, imported dependencies, and interfaces from a given file.
4. Test the AST extraction on a dummy file and output a clean JSON/Markdown structure optimized for an LLM context window.

## Phase 2: Agent Personas & Orchestration (Vercel AI SDK)
1. Implement `src/services/ai-orchestrator.ts` using the Vercel AI SDK.
2. Create a loader service to fetch or read the `security-auditor` and `code-reviewer` markdown prompts from Addy Osmani's `agent-skills` repository.
3. Create the "Planner" orchestration loop: feed the `ts-morph` AST context + file diff to the `code-reviewer` agent, then pass the findings to the `security-auditor` agent for a second pass.
4. Console log the raw AI review recommendations to verify the chain works.

## Phase 3: The Sandbox (isolated-vm)
1. Implement `src/services/sandbox.ts` using `isolated-vm`.
2. Create an ephemeral, secure V8 isolate instance with strictly limited memory and zero network/filesystem access.
3. Add a step to the AI Orchestrator where an agent generates a basic unit test (or type-check script) for the analyzed file.
4. Execute this generated test code inside the `isolated-vm` sandbox and capture the `stdout` or error logs safely without crashing the main Node process.

## Phase 4: CLI UI & Reporting
1. Format the terminal output using `@clack/prompts` to create a polished, step-by-step DX loader in the terminal.
2. Aggregate the code review, security audit, and sandbox execution results into a single structured markdown report.
3. Add a final CLI option to output the report to a `.md` file or directly as a GitHub PR comment using the GitHub API.

## Phase 5: Project Documentation & Repository Polish

We have successfully built the core CLI, the provider-agnostic orchestrator, the AST parser, and the `isolated-vm` sandbox. Now we need to document the tool so it is immediately understandable for an engineering hiring manager.

Please create a new branch for Phase 5 and execute the following steps:

1. **Write the README.md:**
   - Create a clean, professional `README.md` at the root of the repository.
   - Use a human, direct tone. Avoid corporate buzzwords or overly formal AI-generated language (e.g., do not use words like "delve," "cutting-edge," or "harnessing").
   - Include the following sections:
     - **Overview:** A concise 2-sentence summary of what `slipstream` does (an agentic PR review swarm CLI).
     - **Architecture Highlights:** Briefly mention the use of `ts-morph` for AST extraction, the Vercel AI SDK Model Factory (Anthropic/Ollama), and `isolated-vm` for secure sandboxing.
     - **Installation & Setup:** How to install dependencies, set `.env` variables, and pull the local Qwen model.
     - **Usage:** Provide a code block showing the CLI command (`npx slipstream analyze ./src --provider ollama`).

2. **Generate an Architecture Document (`docs/ARCHITECTURE.md`):**
   - Create a brief, practical markdown document outlining the data flow.
   - Explain how the tool uses the "Planner/Swarm" pattern: extracting AST context, passing it to specialized Addy Osmani personas, and verifying the output in an air-gapped isolate.

3. **Establish the PR Template (`.github/pull_request_template.md`):**
   - Create a standard PR template matching our branch-per-step workflow.
   - Include sections for: Summary, Why, Scope, Files Changed, and Checks Run (specifically including a checkbox for "Ran slipstream analysis on diff").

4. **Verify and Wrap Up:**
   - Ensure all markdown files are properly formatted and easy to read.
   - Generate a final PR summary for this documentation branch and pause for my review before merging.

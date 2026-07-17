import { test, mock } from "node:test";
import assert from "node:assert/strict";

type Kind = "code-reviewer" | "security-auditor" | "test-generator";

interface RecordedCall {
  kind: Kind;
  startedAt: number;
  hasSystemCacheControl: boolean;
  hasUserCacheControl: boolean;
}

interface GenerateTextOpts {
  system: string | { content: string; providerOptions?: unknown };
  messages: Array<{ content: Array<{ providerOptions?: unknown }> }>;
}

const FIXED_USAGE = {
  inputTokens: 100,
  inputTokenDetails: { noCacheTokens: 10, cacheReadTokens: 80, cacheWriteTokens: 10 },
  outputTokens: 50,
  outputTokenDetails: { textTokens: 50, reasoningTokens: 0 },
  totalTokens: 150,
};

let calls: RecordedCall[] = [];
let delaysMs: Partial<Record<Kind, number>> = {};
let errorsAfterMs: Partial<Record<Kind, number>> = {};

function classify(system: GenerateTextOpts["system"]): Kind {
  const text = typeof system === "string" ? system : system.content;
  if (text === "CODE_REVIEWER_SYSTEM") return "code-reviewer";
  if (text === "SECURITY_AUDITOR_SYSTEM") return "security-auditor";
  return "test-generator";
}

// Mocks must be registered before the module under test is imported, since ESM
// bindings are resolved (and this file only imports ai-orchestrator.ts once) up
// front. Each test drives behavior through the shared `calls`/`delaysMs`/
// `errorsAfterMs` state instead of re-mocking per test.
mock.module("ai", {
  namedExports: {
    generateText: async (opts: GenerateTextOpts) => {
      const kind = classify(opts.system);
      calls.push({
        kind,
        startedAt: Date.now(),
        hasSystemCacheControl: typeof opts.system !== "string" && opts.system.providerOptions !== undefined,
        hasUserCacheControl: opts.messages[0]?.content[0]?.providerOptions !== undefined,
      });
      const delay = delaysMs[kind] ?? errorsAfterMs[kind] ?? 0;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      if (errorsAfterMs[kind] !== undefined) {
        throw new Error(`${kind} failed`);
      }
      return { text: `${kind}-output`, usage: FIXED_USAGE };
    },
  },
});

mock.module("../utils/model-factory.js", {
  namedExports: {
    createModel: () => ({ id: "mock-model" }),
  },
});

mock.module("./prompt-loader.js", {
  namedExports: {
    loadPersonaPrompt: async (id: "code-reviewer" | "security-auditor") => ({
      id,
      name: id,
      description: "mock persona",
      systemPrompt: id === "code-reviewer" ? "CODE_REVIEWER_SYSTEM" : "SECURITY_AUDITOR_SYSTEM",
    }),
  },
});

mock.module("./sandbox.js", {
  namedExports: {
    runInSandbox: async () => ({ ok: true, logs: [], errors: [] }),
  },
});

const { runReviewPipeline } = await import("./ai-orchestrator.js");

const baseInput = {
  filePath: "example.ts",
  astContext: "ctx",
  diff: "diff",
  provider: "anthropic" as const,
};

test("returns the codeReview/securityAudit/sandboxTest shape assembled from all three passes", async () => {
  calls = [];
  delaysMs = {};
  errorsAfterMs = {};

  const result = await runReviewPipeline(baseInput);

  assert.deepEqual(result, {
    codeReview: "code-reviewer-output",
    securityAudit: "security-auditor-output",
    sandboxTest: {
      code: "test-generator-output",
      result: { ok: true, logs: [], errors: [] },
    },
  });
});

test("kicks off sandbox test generation concurrently with the code-review/security-audit chain", async () => {
  calls = [];
  errorsAfterMs = {};
  // Slow down the code-review call so that, if the pipeline were still
  // sequential, the test-generator call couldn't start until after
  // security-auditor also finished. A concurrent pipeline starts the
  // test-generator call while code-review's delay is still pending.
  delaysMs = { "code-reviewer": 30 };

  await runReviewPipeline(baseInput);

  const order = calls.map((c) => c.kind);
  assert.deepEqual(order, ["code-reviewer", "test-generator", "security-auditor"]);
});

test("reports progress stages in the order the concurrent pipeline actually schedules work", async () => {
  calls = [];
  delaysMs = {};
  errorsAfterMs = {};
  const stages: string[] = [];

  await runReviewPipeline(baseInput, (stage) => stages.push(stage));

  assert.deepEqual(stages, ["loading-personas", "code-review", "sandbox-test", "security-audit"]);
});

test("a code-review failure doesn't leave the concurrent sandbox-test promise as an unhandled rejection", async () => {
  calls = [];
  delaysMs = {};
  // code-review fails fast; test-generator fails slower, after codeReviewPromise
  // has already rejected and runReviewPipeline has already exited. Without a
  // `.catch` on the floating sandbox-test promise, this rejection would have no
  // handler attached and crash the process moments later.
  errorsAfterMs = { "code-reviewer": 10, "test-generator": 50 };

  await assert.rejects(runReviewPipeline(baseInput), /code-reviewer failed/);

  // Stay alive past the test-generator's 50ms failure so that, if it were an
  // unhandled rejection, node's test runner attributes it to this still-running
  // test instead of it silently surfacing after the test (or the process) ends.
  await new Promise((resolve) => setTimeout(resolve, 80));
});

test("marks the persona system prompt and the AST/diff user content as cacheable for the anthropic provider", async () => {
  calls = [];
  delaysMs = {};
  errorsAfterMs = {};

  await runReviewPipeline(baseInput);

  // code-reviewer and security-auditor both use a persona system prompt, so both
  // get system-level cache control; test-generator's system prompt is a hardcoded
  // string (not a persona), so it never does. All three share the same AST/diff
  // user content, so all three get user-level cache control.
  const byKind = Object.fromEntries(calls.map((c) => [c.kind, c]));
  assert.equal(byKind["code-reviewer"]?.hasSystemCacheControl, true);
  assert.equal(byKind["security-auditor"]?.hasSystemCacheControl, true);
  assert.equal(byKind["test-generator"]?.hasSystemCacheControl, false);
  assert.equal(byKind["code-reviewer"]?.hasUserCacheControl, true);
  assert.equal(byKind["security-auditor"]?.hasUserCacheControl, true);
  assert.equal(byKind["test-generator"]?.hasUserCacheControl, true);
});

test("omits cache-control metadata entirely for the ollama provider instead of erroring", async () => {
  calls = [];
  delaysMs = {};
  errorsAfterMs = {};

  await runReviewPipeline({ ...baseInput, provider: "ollama" });

  assert.ok(calls.every((c) => !c.hasSystemCacheControl && !c.hasUserCacheControl));
});

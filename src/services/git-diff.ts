import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function runGitDiff(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf-8" });
}

export function getFileDiff(filePath: string): string {
  try {
    const workingTreeDiff = runGitDiff(["diff", "--no-color", "--", filePath]);
    if (workingTreeDiff.trim().length > 0) {
      return workingTreeDiff;
    }

    const stagedDiff = runGitDiff(["diff", "--no-color", "--cached", "--", filePath]);
    if (stagedDiff.trim().length > 0) {
      return stagedDiff;
    }
  } catch {
    // Not a git repo, git unavailable, or the file isn't tracked — fall through.
  }

  const fileContents = readFileSync(filePath, "utf-8");
  return `(no uncommitted changes detected; showing full file contents)\n\n${fileContents}`;
}

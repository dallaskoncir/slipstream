import { execFileSync } from "node:child_process";

export interface RepoSlug {
  owner: string;
  repo: string;
}

/**
 * Parses `owner/repo` out of a GitHub remote URL, supporting both SSH
 * (`git@github.com:owner/repo.git`) and HTTPS
 * (`https://github.com/owner/repo.git`) forms, with or without the `.git`
 * suffix. Exported (not just used internally) so the parsing logic is
 * testable without shelling out to git.
 */
export function parseGitHubRemote(url: string): RepoSlug | undefined {
  const match = url.trim().match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!match) {
    return undefined;
  }
  const [, owner, repo] = match;
  return owner && repo ? { owner, repo } : undefined;
}

/**
 * Reads the `origin` remote via `git remote get-url` and parses it into
 * `owner/repo`.
 */
export function getRepoSlugFromGit(): RepoSlug | undefined {
  let url: string;
  try {
    url = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf-8" });
  } catch {
    return undefined;
  }
  return parseGitHubRemote(url);
}

export interface PostPrCommentOptions {
  owner: string;
  repo: string;
  pr: number;
  body: string;
  token: string;
}

export interface PostPrCommentResult {
  url: string;
}

export async function postPrComment(options: PostPrCommentOptions): Promise<PostPrCommentResult> {
  const { owner, repo, pr, body, token } = options;
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${pr}/comments`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Failed to post PR comment (HTTP ${response.status}): ${detail || response.statusText}`,
    );
  }

  const json = (await response.json()) as { html_url: string };
  return { url: json.html_url };
}

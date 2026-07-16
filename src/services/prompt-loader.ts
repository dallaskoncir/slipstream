import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export type PersonaId = "code-reviewer" | "security-auditor";

export interface PersonaPrompt {
  id: PersonaId;
  name: string;
  description: string;
  systemPrompt: string;
}

const AGENT_SKILLS_RAW_BASE =
  "https://raw.githubusercontent.com/addyosmani/agent-skills/main/agents";

const CACHE_DIR = path.join(os.tmpdir(), "slipstream-agent-skills");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function parsePersonaMarkdown(id: PersonaId, raw: string): PersonaPrompt {
  const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error(`Persona "${id}" is missing YAML frontmatter`);
  }
  const frontmatter = frontmatterMatch[1] ?? "";
  const body = frontmatterMatch[2] ?? "";
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descriptionMatch = frontmatter.match(/^description:\s*(.+)$/m);
  const name = nameMatch?.[1];
  const description = descriptionMatch?.[1];
  if (!name || !description) {
    throw new Error(`Persona "${id}" frontmatter is missing name or description`);
  }

  return {
    id,
    name: name.trim(),
    description: description.trim(),
    systemPrompt: body.trim(),
  };
}

async function readCache(id: PersonaId): Promise<string | undefined> {
  const cachePath = path.join(CACHE_DIR, `${id}.md`);
  try {
    const stats = await stat(cachePath);
    if (Date.now() - stats.mtimeMs > CACHE_TTL_MS) {
      return undefined;
    }
    return await readFile(cachePath, "utf-8");
  } catch {
    return undefined;
  }
}

async function writeCache(id: PersonaId, raw: string): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(path.join(CACHE_DIR, `${id}.md`), raw, "utf-8");
}

async function fetchPersonaMarkdown(id: PersonaId): Promise<string> {
  const url = `${AGENT_SKILLS_RAW_BASE}/${id}.md`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch persona "${id}" from ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

export async function loadPersonaPrompt(id: PersonaId): Promise<PersonaPrompt> {
  const cached = await readCache(id);
  if (cached) {
    return parsePersonaMarkdown(id, cached);
  }

  const raw = await fetchPersonaMarkdown(id);
  await writeCache(id, raw);
  return parsePersonaMarkdown(id, raw);
}

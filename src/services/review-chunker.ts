// A --diff batch large enough to need multiple review calls (issue #35: even
// with resolveMaxOutputTokens() scaling the per-call output budget, a single
// call still has a hard ceiling — see ai-orchestrator.ts's OUTPUT_TOKENS_CEILING)
// gets split into fixed-size groups of files, each reviewed as its own smaller
// batch and aggregated back into one report. Not byte-size-aware — a handful of
// individually huge files can still land in one chunk and hit the existing
// truncation-notice mechanism; that's a deliberate v1 scoping decision, not
// something this module tries to solve.
export const MAX_FILES_PER_CHUNK = 10;

export function chunkChangedFiles(files: string[], maxFilesPerChunk: number = MAX_FILES_PER_CHUNK): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < files.length; i += maxFilesPerChunk) {
    chunks.push(files.slice(i, i + maxFilesPerChunk));
  }
  return chunks;
}

import { readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * Directories to skip during recursive traversal.
 * Prevents descending into dependency folders, build artifacts,
 * or version-control directories that are not source code.
 */
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
]);

/**
 * Recursively walks a directory tree and returns the absolute paths
 * of every TypeScript file found (extensions `.ts` or `.tsx`).
 *
 * How it works:
 *   1. Read the current directory's entries with `readdirSync`.
 *   2. For each entry, resolve its absolute path via `join(dirPath, name)`.
 *   3. If it is a directory:
 *        - Skip it if its name is in IGNORED_DIRECTORIES (security guard).
 *        - Otherwise, recurse into it (depth-first).
 *   4. If it is a file and its name ends with `.ts` or `.tsx`, add it to
 *      the result array.
 *   5. Return the flattened array of file paths to the caller.
 *
 * @param dirPath - Absolute or relative path to the directory to scan.
 * @returns A flat array of absolute file paths matching `*.ts` / `*.tsx`.
 */
export function findTsFiles(dirPath: string): string[] {
  const results: string[] = [];

  let entries: string[];
  try {
    // Read all entry names in the current directory.
    entries = readdirSync(dirPath);
  } catch {
    // If the directory cannot be read (permissions, not a directory, etc.),
    // return an empty slice for this branch — no error is thrown so the
    // scan continues on sibling branches.
    return results;
  }

  for (const name of entries) {
    const fullPath = join(dirPath, name);

    let stats;
    try {
      stats = statSync(fullPath);
    } catch {
      // Symlink broken, permission denied, etc. — skip this entry silently.
      continue;
    }

    if (stats.isDirectory()) {
      // Security guard: never recurse into well-known non-source directories.
      if (IGNORED_DIRECTORIES.has(name)) {
        continue;
      }
      // Depth-first recursion: collect files from the subdirectory.
      const subFiles = findTsFiles(fullPath);
      results.push(...subFiles);
    } else if (stats.isFile() && (name.endsWith(".ts") || name.endsWith(".tsx"))) {
      // Push the absolute path so the caller can pass it directly to
      // parseReactComponent without further resolution.
      results.push(fullPath);
    }
  }

  return results;
}

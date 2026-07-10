import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

function isWithinRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * Resolve a path through the nearest existing ancestor. This exposes symlinked
 * directories even when the final file does not exist yet.
 */
function canonicalizePath(filePath: string): string {
  let current = resolve(filePath);
  const missingSegments: string[] = [];

  while (true) {
    try {
      lstatSync(current);
      return resolve(realpathSync(current), ...missingSegments);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw err;

      const parent = dirname(current);
      if (parent === current) throw err;
      missingSegments.unshift(basename(current));
      current = parent;
    }
  }
}

/** Resolve a caller-provided path and reject lexical or symlink-based escapes. */
export function resolvePathWithinRoot(filePath: string, rootDirectory: string): string {
  const root = resolve(rootDirectory);
  const candidate = resolve(root, filePath);

  if (!isWithinRoot(root, candidate)) {
    throw new Error(`Path escapes working directory: ${filePath}`);
  }

  let canonicalRoot: string;
  let canonicalCandidate: string;
  try {
    canonicalRoot = canonicalizePath(root);
    canonicalCandidate = canonicalizePath(candidate);
  } catch (err) {
    throw new Error(
      `Path escapes working directory or contains an unresolved symbolic link: ${filePath}`,
      { cause: err },
    );
  }

  if (!isWithinRoot(canonicalRoot, canonicalCandidate)) {
    throw new Error(`Path escapes working directory through a symbolic link: ${filePath}`);
  }

  return candidate;
}

import fs from 'fs';
import path from 'path';

function normalizePaths(paths: string[]): string[] {
  const unique = new Set<string>();

  for (const p of paths) {
    if (!p || typeof p !== 'string') continue;
    unique.add(path.resolve(p));
  }

  return Array.from(unique);
}

export function getDefaultAllowlist(projectRoot: string, groupsDir: string): string[] {
  return normalizePaths([projectRoot, groupsDir]);
}

export function loadMountAllowlist(
  allowlistPath: string,
  fallbackPaths: string[],
): string[] {
  const fallback = normalizePaths(fallbackPaths);

  if (!fs.existsSync(allowlistPath)) {
    return fallback;
  }

  try {
    const content = fs.readFileSync(allowlistPath, 'utf-8');
    const parsed = JSON.parse(content) as unknown;

    if (Array.isArray(parsed)) {
      const list = normalizePaths(parsed.filter((entry) => typeof entry === 'string'));
      return list.length > 0 ? list : fallback;
    }

    if (typeof parsed === 'object' && parsed !== null && 'paths' in parsed) {
      const maybePaths = (parsed as { paths?: unknown }).paths;
      if (Array.isArray(maybePaths)) {
        const list = normalizePaths(maybePaths.filter((entry) => typeof entry === 'string'));
        return list.length > 0 ? list : fallback;
      }
    }

    return fallback;
  } catch {
    return fallback;
  }
}

export function isPathAllowed(hostPath: string, allowlistPaths: string[]): boolean {
  const resolvedHostPath = path.resolve(hostPath);

  for (const allowedPath of allowlistPaths) {
    const resolvedAllowedPath = path.resolve(allowedPath);
    const relative = path.relative(resolvedAllowedPath, resolvedHostPath);

    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      return true;
    }
  }

  return false;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function readVersionFromDeps(pkg: PackageJson, dep: string): string {
  return (
    pkg.dependencies?.[dep] ||
    pkg.devDependencies?.[dep] ||
    'not found'
  );
}

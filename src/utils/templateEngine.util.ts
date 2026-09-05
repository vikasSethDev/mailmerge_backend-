const VARIABLE_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

/**
 * Replaces {{variable}} placeholders with values from `fields`.
 * Unknown variables are left as-is (rather than silently becoming "undefined")
 * so authoring mistakes are visible in preview instead of being swallowed.
 */
export function renderTemplate(template: string, fields: Record<string, string>): string {
  if (!template) return '';
  return template.replace(VARIABLE_PATTERN, (match, variableName: string) => {
    const value = fields[variableName];
    return value !== undefined && value !== null ? String(value) : match;
  });
}

export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(VARIABLE_PATTERN);
  while ((match = regex.exec(template)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found);
}

export function listUnresolvedVariables(rendered: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(VARIABLE_PATTERN);
  while ((match = regex.exec(rendered)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found);
}

export function splitEmailList(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

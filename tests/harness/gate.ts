import fs from 'node:fs';
import path from 'node:path';

export interface Outcome {
  id: string;
  tier: string;
  title: string;
  status: 'passed' | 'failed';
  message?: string;
}

const OUTCOMES = process.env.OLFX_OUTCOMES
  ? path.resolve(process.env.OLFX_OUTCOMES)
  : path.join(process.cwd(), 'test-results', 'outcomes.jsonl');

let allow: Set<string> | null = null;

function expectedSet(): Set<string> {
  if (allow) return allow;
  const file = path.join(process.cwd(), 'tests', 'expected-failures.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { failures?: string[] };
  allow = new Set(parsed.failures ?? []);
  return allow;
}

export function isExpectedFailure(id: string, tier: string): boolean {
  return expectedSet().has(`${id}@${tier}`);
}

export function recordOutcome(outcome: Outcome): void {
  fs.mkdirSync(path.dirname(OUTCOMES), { recursive: true });
  fs.appendFileSync(OUTCOMES, `${JSON.stringify(outcome)}\n`);
}

export async function runExpected(id: string, tier: string, title: string, fn: () => Promise<void> | void): Promise<void> {
  const key = `${id}@${tier}`;
  const allowed = expectedSet().has(key);
  try {
    await fn();
    recordOutcome({ id, tier, title, status: 'passed' });
    if (allowed) {
      throw new Error(`${key} passed. Remove it from tests/expected-failures.json.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('tests/expected-failures.json')) throw error;
    if (!allowed) throw error;
    recordOutcome({ id, tier, title, status: 'failed', message });
  }
}

export function parseTitle(title: string): { id: string; tier: string } {
  const match = /^([A-Z][A-Z0-9]*-\d+) @([a-z]+)\b/.exec(title);
  if (!match) throw new Error(`Requirement title must start with ID @tier: ${title}`);
  return { id: match[1], tier: match[2] };
}

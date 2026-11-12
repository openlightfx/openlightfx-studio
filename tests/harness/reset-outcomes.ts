import fs from 'node:fs';
import path from 'node:path';

export default function resetOutcomes(): void {
  const file = process.env.OLFX_OUTCOMES ?? path.join(process.cwd(), 'test-results', 'outcomes.jsonl');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
}

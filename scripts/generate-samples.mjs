#!/usr/bin/env node
// Writes simulated NDJSON reports to sample-data/ (same generator as the web demo).
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as S from '../js/sim.js';

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sample-data');
await mkdir(outDir, { recursive: true });

const last = S.DAYS.length - 1;
const legacyDay = S.NAMES_START_INDEX - 1;
const files = {
  'organization-28-day.ndjson': S.buildAggregate28DayReport(),
  [`organization-1-day_${S.DAYS[last]}.ndjson`]: [S.buildAggregateDayRecord(last)],
  [`organization-1-day_${S.DAYS[legacyDay]}_legacy.ndjson`]: [S.buildAggregateDayRecord(legacyDay)],
  [`users-1-day_${S.DAYS[last]}.ndjson`]: S.buildUsersDayReport(last),
  'users-28-day.ndjson': S.buildUsers28DayReport(),
};

for (const [name, records] of Object.entries(files)) {
  await writeFile(path.join(outDir, name), S.toNdjson(records));
  console.log(`wrote sample-data/${name} (${records.length} record${records.length === 1 ? '' : 's'})`);
}

import { todayIso, type ReportMeta } from '@/core';
import { getMyHousehold, type Db } from '@/db';

/** Header facts printed on every report: my family's name, the filters in use, today's date. */
export async function reportMeta(db: Db, filters: string[]): Promise<ReportMeta> {
  const me = await getMyHousehold(db);
  return { familyName: me?.headName ?? '', filters, generatedOn: todayIso() };
}

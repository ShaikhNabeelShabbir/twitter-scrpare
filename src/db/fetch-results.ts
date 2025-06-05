import { db } from "./config";
import { fetchResults, NewFetchResult } from "./schema";

export async function saveFetchResult(result: NewFetchResult) {
  return db.insert(fetchResults).values(result).returning();
}

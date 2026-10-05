/** Minimal slice of expo-sqlite's SQLiteDatabase used by the repositories (keeps them mockable). */
export interface Db {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: (string | number | null)[]): Promise<unknown>;
  getAllAsync<T>(source: string, params: (string | number | null)[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: (string | number | null)[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

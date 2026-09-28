/**
 * Mock Supabase client for testing.
 * Returns a chainable query builder that resolves to configured data.
 */

export type QueryResult<T> = Promise<{ data: T | null; error: Error | null; count?: number }>;
export type QueryResultArray<T> = Promise<{ data: T[] | null; error: Error | null }>;
export type MutationResult = Promise<{ error: Error | null }>;
export type SelectResult<T> = {
  select: SelectResult<T>;
  eq: SelectResult<T>;
  in: SelectResult<T>;
  single: () => QueryResult<T>;
  then: (resolve: (val: { data: T[] | null; error: null }) => void) => void;
  order: SelectResult<T>;
  limit: SelectResult<T>;
};

function createQueryBuilder<T>(data: T | T[] | null, error: Error | null = null, count?: number): any {
  const currentData = data;
  const currentError = error;
  let eqField = '';
  let eqValue: any = '';
  let inField = '';
  let inValues: any[] = [];
  let orderField = '';
  let orderAscending = false;
  let limitValue = 0;

  const builder: any = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') {
        return (onFulfilled: any) => {
          if (currentError) {
            return Promise.resolve({ data: null, error: currentError });
          }
          let result = currentData;
          // apply filters
          if (inField && Array.isArray(result)) {
            result = (result as any[]).filter(item => {
              const val = item[inField];
              return inValues.includes(val);
            });
          }
          if (eqField && Array.isArray(result)) {
            result = (result as any[]).filter(item => item[eqField] === eqValue);
          }
          if (Array.isArray(result) && orderField) {
            result = [...result].sort((a, b) => {
              const aVal = (a as any)[orderField];
              const bVal = (b as any)[orderField];
              if (orderAscending) return aVal > bVal ? 1 : -1;
              return aVal < bVal ? 1 : -1;
            });
          }
          if (Array.isArray(result) && limitValue) {
            result = result.slice(0, limitValue);
          }
          return onFulfilled({ data: result, error: null });
        };
      }
      if (prop === 'select') {
        return (..._args: any[]) => createQueryBuilder<T>(currentData, currentError, count);
      }
      if (prop === 'eq') {
        return (field: string, value: any) => {
          eqField = field;
          eqValue = value;
          return createQueryBuilder<T>(currentData, currentError, 0);
        };
      }
      if (prop === 'in') {
        return (field: string, values: any[]) => {
          inField = field;
          inValues = values;
          return createQueryBuilder<T>(currentData, currentError, 0);
        };
      }
      if (prop === 'order') {
        return (field: string, opts?: { ascending?: boolean }) => {
          orderField = field;
          orderAscending = opts?.ascending ?? false;
          return createQueryBuilder<T>(currentData, currentError, 0);
        };
      }
      if (prop === 'limit') {
        return (n: number) => {
          limitValue = n;
          return createQueryBuilder<T>(currentData, currentError, 0);
        };
      }
      if (prop === 'single') {
        return () => Promise.resolve({ data: Array.isArray(currentData) ? currentData[0] ?? null : currentData, error: currentError });
      }
      if (prop === 'insert') {
        return (data: any) => {
          void data;
          return Promise.resolve({ error: currentError });
        };
      }
      if (prop === 'update') {
        return (data: any) => {
          void data;
          return Promise.resolve({ error: currentError });
        };
      }
      if (prop === 'delete') {
        return () => Promise.resolve({ error: currentError });
      }
      if (prop === 'count') {
        return { exact: count ?? 0 };
      }
      if (prop === 'then') {
        return undefined;
      }
      return (..._args: any[]) => createQueryBuilder<T>(currentData, currentError, count);
    },
  });

  return builder;
}

function createMockSupabase() {
  const store: Record<string, any[]> = {};
  const errors: Record<string, Error | null> = {};

  const from = (table: string) => {
    const builder: any = new Proxy({}, {
      get(_target, prop) {
        if (prop === 'select') {
          return (..._args: any[]) => createQueryBuilder(store[table] ?? null, errors[table] ?? null);
        }
        if (prop === 'insert') {
          return (data: any) => {
            if (!store[table]) store[table] = [];
            store[table].push(data);
            return Promise.resolve({ error: errors[table] ?? null });
          };
        }
        if (prop === 'update') {
          return (data: any) => {
            const rows = store[table] ?? [];
            for (const key of Object.keys(data)) {
              for (const row of rows) {
                if (row[key] !== undefined) row[key] = data[key];
              }
            }
            return Promise.resolve({ error: errors[table] ?? null });
          };
        }
        if (prop === 'delete') {
          return () => Promise.resolve({ error: errors[table] ?? null });
        }
        return (..._args: any[]) => createQueryBuilder(store[table] ?? null, errors[table] ?? null);
      },
    });
    return builder;
  };

  return { from };
}

export function createMockSupabaseWithData(data: Record<string, any[]>, errors: Record<string, Error | null> = {}) {
  const store: Record<string, any[]> = {};
  const errorStore: Record<string, Error | null> = {};

  for (const [key, value] of Object.entries(data)) {
    store[key] = value;
  }
  for (const [key, value] of Object.entries(errors)) {
    errorStore[key] = value;
  }

  const from = (table: string) => {
    return new Proxy({}, {
      get(_target, prop) {
        if (prop === 'select') {
          return (..._args: any[]) =>
            createQueryBuilder(store[table] ?? null, errorStore[table] ?? null, store[table]?.length);
        }
        if (prop === 'insert') {
          return (insertData: any) => {
            if (!store[table]) store[table] = [];
            store[table].push(insertData);
            return Promise.resolve({ error: errorStore[table] ?? null });
          };
        }
        if (prop === 'update') {
          return (updateData: any) => {
            const rows = store[table] ?? [];
            for (const row of rows) {
              Object.assign(row, updateData);
            }
            return Promise.resolve({ error: errorStore[table] ?? null });
          };
        }
        if (prop === 'delete') {
          return () => Promise.resolve({ error: errorStore[table] ?? null });
        }
        return (..._args: any[]) =>
          createQueryBuilder(store[table] ?? null, errorStore[table] ?? null);
      },
    });
  };

  return { from };
}

export { createMockSupabase };

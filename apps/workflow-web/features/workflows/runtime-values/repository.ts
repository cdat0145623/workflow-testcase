import type pg from "pg";

export interface RuntimeValuesStoredRecord {
  testCaseId: string;
  username: string;
  passwordCiphertext: string;
  taskTitle: string;
  assigneeName: string;
  updatedAt: string;
}

export interface RuntimeValuesWrite {
  username: string;
  passwordCiphertext: string;
  taskTitle: string;
  assigneeName: string;
}

interface RuntimeValuesQuery {
  query<Row extends object = Record<string, unknown>>(query: string, values?: unknown[]): Promise<{ rows: Row[] }>;
}

function asRecord(row: RuntimeValuesStoredRecord): RuntimeValuesStoredRecord {
  return { ...row, updatedAt: new Date(row.updatedAt).toISOString() };
}

export interface RuntimeValuesRepository {
  get(testCaseId: string, client?: RuntimeValuesQuery): Promise<RuntimeValuesStoredRecord | undefined>;
  upsert(testCaseId: string, values: RuntimeValuesWrite, client?: RuntimeValuesQuery): Promise<RuntimeValuesStoredRecord>;
}

export function createRuntimeValuesRepository(pool: pg.Pool): RuntimeValuesRepository {
  const executor = (client?: RuntimeValuesQuery) => client ?? pool;
  return {
    async get(testCaseId, client) {
      const result = await executor(client).query<RuntimeValuesStoredRecord>(
        'SELECT test_case_id AS "testCaseId", username, password_ciphertext AS "passwordCiphertext", task_title AS "taskTitle", assignee_name AS "assigneeName", updated_at AS "updatedAt" FROM test_case_runtime_values WHERE test_case_id = $1',
        [testCaseId],
      );
      return result.rows[0] ? asRecord(result.rows[0]) : undefined;
    },
    async upsert(testCaseId, values, client) {
      const result = await executor(client).query<RuntimeValuesStoredRecord>(
        `INSERT INTO test_case_runtime_values (test_case_id, username, password_ciphertext, task_title, assignee_name)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (test_case_id) DO UPDATE SET
           username = EXCLUDED.username,
           password_ciphertext = EXCLUDED.password_ciphertext,
           task_title = EXCLUDED.task_title,
           assignee_name = EXCLUDED.assignee_name,
           updated_at = NOW()
         RETURNING test_case_id AS "testCaseId", username, password_ciphertext AS "passwordCiphertext", task_title AS "taskTitle", assignee_name AS "assigneeName", updated_at AS "updatedAt"`,
        [testCaseId, values.username, values.passwordCiphertext, values.taskTitle, values.assigneeName],
      );
      return asRecord(result.rows[0]!);
    },
  };
}

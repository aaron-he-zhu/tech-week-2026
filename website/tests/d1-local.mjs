import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function database(path = ':memory:') {
  const sql = new DatabaseSync(path);
  sql.exec(readFileSync(new URL('../backend/schema.sql', import.meta.url), 'utf8'));
  return {
    sql,
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
    prepare(query) {
      let values = [];
      return {
        bind(...v) {
          values = v;
          return this;
        },
        async first() {
          return sql.prepare(query).get(...values) || null;
        },
        async all() {
          return { results: sql.prepare(query).all(...values) };
        },
        async run() {
          return sql.prepare(query).run(...values);
        },
      };
    },
  };
}

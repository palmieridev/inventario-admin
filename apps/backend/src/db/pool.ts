import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  ...config.database,
  max: 5,
  connectionTimeoutMillis: 3_000,
  idleTimeoutMillis: 10_000,
  query_timeout: 3_000,
});

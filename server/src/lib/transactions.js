import { db } from "../config/database.js";

/*
 * Runs `work` inside a single MySQL transaction.
 *
 * Record writes always pair with an audit event, and mapping/definition writes
 * touch several tables, so both must commit or roll back together.
 */
export async function withTransaction(work) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const result = await work(connection);

    await connection.commit();

    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /*
       * Rollback can fail when the connection was lost. The original error is
       * more useful than the rollback failure, so it is swallowed here.
       */
    }

    throw error;
  } finally {
    connection.release();
  }
}

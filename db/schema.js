import { boolean, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core"

export const payment = pgTable('payment', {
  id: serial('id').primaryKey(),
  txnId: varchar('txn_id', { length: 100 }).unique(),
  amount: integer('amount').notNull(),
  ref: varchar('ref', { length: 50 }).notNull().unique(),
  content: varchar('content', { length: 20 }).notNull().unique(),
  status: boolean('status').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
});



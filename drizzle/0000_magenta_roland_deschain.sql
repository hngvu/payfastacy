CREATE TABLE "payment" (
	"id" serial PRIMARY KEY NOT NULL,
	"txn_id" varchar(100),
	"amount" integer NOT NULL,
	"ref" varchar(50) NOT NULL,
	"content" varchar(20) NOT NULL,
	"status" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "payment_txn_id_unique" UNIQUE("txn_id"),
	CONSTRAINT "payment_ref_unique" UNIQUE("ref"),
	CONSTRAINT "payment_content_unique" UNIQUE("content")
);

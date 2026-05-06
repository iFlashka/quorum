-- DM (личные сообщения 1:1) — фаза 8.

CREATE TABLE "dm_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_a_id" uuid NOT NULL,
	"user_b_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_channels_pair_canonical_check" CHECK ("user_a_id" < "user_b_id")
);
--> statement-breakpoint

ALTER TABLE "dm_channels" ADD CONSTRAINT "dm_channels_user_a_id_users_id_fk"
	FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "dm_channels" ADD CONSTRAINT "dm_channels_user_b_id_users_id_fk"
	FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX "dm_channels_pair_key" ON "dm_channels" ("user_a_id", "user_b_id");
--> statement-breakpoint
CREATE INDEX "dm_channels_user_a_idx" ON "dm_channels" ("user_a_id");
--> statement-breakpoint
CREATE INDEX "dm_channels_user_b_idx" ON "dm_channels" ("user_b_id");
--> statement-breakpoint

-- messages: channel_id становится nullable, добавляется dm_channel_id; ровно
-- одно из них должно быть заполнено.
ALTER TABLE "messages" ALTER COLUMN "channel_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "dm_channel_id" uuid;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_dm_channel_id_dm_channels_id_fk"
	FOREIGN KEY ("dm_channel_id") REFERENCES "public"."dm_channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_target_check" CHECK (
	("channel_id" IS NOT NULL AND "dm_channel_id" IS NULL) OR
	("channel_id" IS NULL AND "dm_channel_id" IS NOT NULL)
);
--> statement-breakpoint

CREATE INDEX "messages_dm_channel_created_idx" ON "messages" ("dm_channel_id", "created_at" DESC);

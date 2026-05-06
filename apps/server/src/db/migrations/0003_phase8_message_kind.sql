-- messages.kind для system-сообщений в DM (call_started / call_ended).

ALTER TABLE "messages" ADD COLUMN "kind" text NOT NULL DEFAULT 'text';
--> statement-breakpoint

ALTER TABLE "messages" ADD CONSTRAINT "messages_kind_check"
	CHECK ("kind" IN ('text', 'call_started', 'call_ended'));

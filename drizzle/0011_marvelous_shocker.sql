ALTER TABLE `coupons` ADD `voided_at` text;--> statement-breakpoint
ALTER TABLE `enrollments` ADD `revoked_at` text;--> statement-breakpoint
ALTER TABLE `refunds` ADD `decline_note` text;
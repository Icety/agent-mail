-- The personal address kind and inbound category were called 'for-thomas' when this lived in Koopa.
UPDATE `mail_addresses` SET `kind` = 'owner' WHERE `kind` = 'for-thomas';--> statement-breakpoint
UPDATE `mail_inbound` SET `category` = 'owner' WHERE `category` = 'for-thomas';

-- Keep the original display body for older clients and pushes, alongside its language independent template.
ALTER TABLE notifications ADD COLUMN message_template jsonb;

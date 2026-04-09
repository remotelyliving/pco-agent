-- System default rules — idempotent upserts
INSERT INTO agent.rules (id, content, category, rule_type, visibility, sort_order, created_at)
VALUES
  ('system-scheduling-blockout', 'Always check a person''s blockout dates before scheduling them for a service.', 'scheduling', 'system', 'org', 0, NOW()),
  ('system-general-confirm', 'Confirm with the user before creating, updating, or removing any records.', 'general', 'system', 'org', 0, NOW()),
  ('system-scheduling-fair-rotation', 'When scheduling volunteers, check when they last served to distribute fairly.', 'scheduling', 'system', 'org', 0, NOW()),
  ('system-scheduling-song-repeat', 'When planning songs for a service, check when each song was last used to avoid repeating too soon.', 'scheduling', 'system', 'org', 0, NOW()),
  ('system-general-plain-language', 'Use plain, friendly language. Avoid technical jargon.', 'general', 'system', 'org', 0, NOW()),
  ('system-people-contact-info', 'When showing lists of people, include their role and contact info when available.', 'people', 'system', 'org', 0, NOW()),
  ('system-general-admit-uncertainty', 'If you''re unsure about something, say so rather than guessing.', 'general', 'system', 'org', 0, NOW())
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  category = EXCLUDED.category,
  rule_type = EXCLUDED.rule_type,
  visibility = EXCLUDED.visibility;

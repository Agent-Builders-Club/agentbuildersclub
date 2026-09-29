-- Synthetic-only public/private skills fixture. Ties exercise date ordering.
INSERT INTO skills (id,name,description,category,trigger_phrases,instructions,submitted_by,agent_id,approved,flagged,install_count,created_at) VALUES
('alpha','Unsafe / Name!','Alpha description','Utility','["first","second"]','Alpha instructions','Alice','private-agent',1,0,4,'2026-01-01T00:00:00.000Z'),
('beta','Beta','Beta description','Research','[]','Beta instructions','Bob',NULL,1,0,4,'2026-01-02T00:00:00.000Z'),
('zeta','Zeta','Zeta description','Social','[]','Zeta instructions','Zoe',NULL,1,0,1,'2026-01-03T00:00:00.000Z'),
('pending','Pending','Private','Utility','[]','Hidden instructions','Private',NULL,0,0,999,'2026-01-04T00:00:00.000Z'),
('flagged','Flagged','Private','Utility','[]','Hidden instructions','Private',NULL,1,1,999,'2026-01-04T00:00:00.000Z');

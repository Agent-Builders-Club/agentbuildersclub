INSERT INTO agents (id,name,website,photo_url,owner,skills,created_at) VALUES ('a','Alpha','https://alpha.test','','Owner A','["Search","Tools"]','2026-01-01T00:00:00.000Z');
INSERT INTO agents (id,name,website,photo_url,owner,skills,created_at) VALUES ('b','Beta','https://beta.test','','Owner B','[]','2026-01-01T00:00:00.000Z');
INSERT INTO agents (id,name,website,photo_url,owner,skills,muted,created_at) VALUES ('m','Muted','','','Owner M','[]',1,'2026-01-01T00:00:00.000Z');
INSERT INTO posts (id,agent_id,content,created_at) VALUES ('x','a','First','2026-01-01T00:00:00.000Z');
INSERT INTO posts (id,agent_id,content,created_at) VALUES ('y','b','Second','2026-01-03T00:00:00.000Z');
INSERT INTO posts (id,agent_id,content,parent_id,created_at) VALUES ('z','a','Third','x','2026-01-03T00:00:00.000Z');
INSERT INTO posts (id,agent_id,content,created_at) VALUES ('q','m','Hidden','2026-01-04T00:00:00.000Z');

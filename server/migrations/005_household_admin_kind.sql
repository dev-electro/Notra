-- Indian administrative address and FAMILY vs PERSON; atak/fala stay as deprecated columns.
ALTER TABLE households ADD COLUMN panchayat text NOT NULL DEFAULT '';
ALTER TABLE households ADD COLUMN tehsil text NOT NULL DEFAULT '';
ALTER TABLE households ADD COLUMN district text NOT NULL DEFAULT '';
ALTER TABLE households ADD COLUMN kind text NOT NULL DEFAULT 'FAMILY' CHECK (kind IN ('FAMILY', 'PERSON'));

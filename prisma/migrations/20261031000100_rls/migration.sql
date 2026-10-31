-- Database-level authorization. The application connects as `dar_app` for per-request work.
-- That role is not the table owner, so row level security applies to it. Each request
-- transaction sets app.user_id (src/lib/db.ts); with no user set, policies expose nothing.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dar_app') THEN
    CREATE ROLE dar_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO dar_app;
GRANT USAGE ON SCHEMA public TO dar_app;

CREATE FUNCTION app.uid() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '') $$;

CREATE FUNCTION app.has_perm(perm text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp."roleId" = ur."roleId"
    JOIN permissions p ON p.id = rp."permissionId"
    WHERE ur."userId" = app.uid() AND p.key = perm
  )
$$;

-- Permission held globally, or scoped to the given branch.
CREATE FUNCTION app.has_perm_in_branch(perm text, branch text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN role_permissions rp ON rp."roleId" = ur."roleId"
    JOIN permissions p ON p.id = rp."permissionId"
    WHERE ur."userId" = app.uid() AND p.key = perm
      AND (ur."branchId" IS NULL OR ur."branchId" = branch)
  )
$$;

CREATE FUNCTION app.teaches_student(sid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM enrollments e
    JOIN halaqas h ON h.id = e."halaqaId"
    JOIN teachers t ON t.id = h."teacherId"
    WHERE e."studentId" = sid AND e.status = 'ACTIVE' AND t."userId" = app.uid()
  ) OR EXISTS (
    -- Substitute teachers get access only around the session they cover.
    SELECT 1 FROM enrollments e
    JOIN halaqa_sessions s ON s."halaqaId" = e."halaqaId"
    JOIN teachers t ON t.id = s."substituteTeacherId"
    WHERE e."studentId" = sid AND e.status = 'ACTIVE' AND t."userId" = app.uid()
      AND s."startsAt" BETWEEN now() - interval '7 days' AND now() + interval '7 days'
  )
$$;

CREATE FUNCTION app.is_staff_for_student(sid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = sid AND (
      app.has_perm_in_branch('students.view_all', s."branchId")
    )
  )
$$;

CREATE FUNCTION app.is_student_self(sid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM students s WHERE s.id = sid AND s."userId" = app.uid())
$$;

CREATE FUNCTION app.is_guardian_of(sid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM guardian_student_links l
    JOIN guardians g ON g.id = l."guardianId"
    WHERE l."studentId" = sid AND l.status = 'APPROVED' AND g."userId" = app.uid()
  )
$$;

CREATE FUNCTION app.can_read_student(sid text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.is_student_self(sid) OR app.is_guardian_of(sid)
      OR app.teaches_student(sid) OR app.is_staff_for_student(sid)
$$;

CREATE FUNCTION app.can_teach_student(sid text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.teaches_student(sid) OR app.is_staff_for_student(sid)
$$;

CREATE FUNCTION app.can_see_user(target text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT target = app.uid()
    OR app.has_perm('users.manage')
    OR EXISTS (SELECT 1 FROM students s WHERE s."userId" = target AND app.can_read_student(s.id))
    OR EXISTS (SELECT 1 FROM teachers t WHERE t."userId" = target)
    OR EXISTS (
      SELECT 1 FROM guardians g
      JOIN guardian_student_links l ON l."guardianId" = g.id AND l.status = 'APPROVED'
      WHERE g."userId" = target AND app.can_teach_student(l."studentId")
    )
$$;

CREATE FUNCTION app.can_manage_halaqa(hid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM halaqas h WHERE h.id = hid AND app.has_perm_in_branch('halaqas.manage', h."branchId")
  )
$$;

CREATE FUNCTION app.teaches_halaqa(hid text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM halaqas h JOIN teachers t ON t.id = h."teacherId"
    WHERE h.id = hid AND t."userId" = app.uid()
  ) OR EXISTS (
    SELECT 1 FROM halaqa_sessions s JOIN teachers t ON t.id = s."substituteTeacherId"
    WHERE s."halaqaId" = hid AND t."userId" = app.uid()
  )
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dar_app;

-- Base grants. RLS below narrows them. Tables absent here stay inaccessible to the app role
-- (auth_sessions, auth_accounts, verifications, jobs reads, rate_limits).
GRANT SELECT ON riwayat, quran_surahs, quran_pages, quran_ayahs, reciters, recitations,
  audio_timings, tajweed_annotations, tajweed_rules, tajweed_examples, tafsir_sources,
  tafsir_entries, roles, permissions, role_permissions, badges, notification_templates TO dar_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON users, user_roles, branches, students, guardians,
  guardian_student_links, teachers, halaqas, halaqa_schedules, enrollments, halaqa_sessions,
  attendance, bookmarks, reading_positions, curriculums, learning_plans, daily_tasks,
  memorization_records, revision_records, recitation_submissions, teacher_reviews,
  student_badges, questions, assessments, assessment_questions, assessment_attempts,
  assessment_answers, certificates, notifications, notification_preferences, content_pages,
  messages, contact_messages, settings, files TO dar_app;

-- Scholarly review changes status columns only; imported content stays immutable to the app.
GRANT UPDATE ("status", "reviewedBy", "reviewedAt") ON tafsir_sources TO dar_app;
GRANT UPDATE ("reviewStatus", "reviewedBy", "reviewedAt") ON tajweed_annotations, tajweed_rules TO dar_app;
GRANT UPDATE ("reviewStatus", "reviewedBy") ON tajweed_examples TO dar_app;

-- Audit log and queue are insert-only from the app role.
GRANT SELECT, INSERT ON audit_logs TO dar_app;
GRANT INSERT ON jobs TO dar_app;

-- ---------- Helper: student-scoped tables ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance','learning_plans','daily_tasks','memorization_records',
    'revision_records','recitation_submissions','teacher_reviews','student_badges',
    'assessment_attempts','certificates','enrollments']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY read_scope ON %I FOR SELECT TO dar_app USING (app.can_read_student("studentId"))', t);
    EXECUTE format('CREATE POLICY teach_insert ON %I FOR INSERT TO dar_app WITH CHECK (app.can_teach_student("studentId"))', t);
    EXECUTE format('CREATE POLICY teach_update ON %I FOR UPDATE TO dar_app USING (app.can_teach_student("studentId")) WITH CHECK (app.can_teach_student("studentId"))', t);
    EXECUTE format('CREATE POLICY teach_delete ON %I FOR DELETE TO dar_app USING (app.is_staff_for_student("studentId"))', t);
  END LOOP;
END $$;

-- Student self-service, narrower than teacher access.
CREATE POLICY self_update ON daily_tasks FOR UPDATE TO dar_app
  USING (app.is_student_self("studentId")) WITH CHECK (app.is_student_self("studentId"));
CREATE POLICY self_insert ON daily_tasks FOR INSERT TO dar_app
  WITH CHECK (app.is_student_self("studentId") AND "carriedFromId" IS NOT NULL);
CREATE POLICY self_insert ON recitation_submissions FOR INSERT TO dar_app
  WITH CHECK (app.is_student_self("studentId"));
CREATE POLICY self_update ON recitation_submissions FOR UPDATE TO dar_app
  USING (app.is_student_self("studentId")) WITH CHECK (app.is_student_self("studentId") AND status IN ('SUBMITTED','DELETED'));
CREATE POLICY self_insert ON memorization_records FOR INSERT TO dar_app
  WITH CHECK (app.is_student_self("studentId") AND status IN ('IN_PROGRESS','SUBMITTED'));
CREATE POLICY self_insert ON assessment_attempts FOR INSERT TO dar_app
  WITH CHECK (app.is_student_self("studentId"));
CREATE POLICY self_update ON assessment_attempts FOR UPDATE TO dar_app
  USING (app.is_student_self("studentId") AND status = 'IN_PROGRESS') WITH CHECK (app.is_student_self("studentId"));
CREATE POLICY self_insert ON enrollments FOR INSERT TO dar_app
  WITH CHECK ((app.is_student_self("studentId") OR app.is_guardian_of("studentId")) AND status IN ('PENDING','WAITLISTED'));
CREATE POLICY self_update ON enrollments FOR UPDATE TO dar_app
  USING (app.is_student_self("studentId")) WITH CHECK (app.is_student_self("studentId") AND status = 'WITHDRAWN');

-- Certificates: approval needs certificates.approve, enforced by this trigger for every role.
CREATE FUNCTION app.guard_certificate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'dar_app' AND NEW.status = 'ISSUED' AND
     (TG_OP = 'INSERT' OR OLD.status <> 'ISSUED') THEN
    IF NOT app.has_perm('certificates.approve') THEN
      RAISE EXCEPTION 'certificate approval requires an authorized person' USING ERRCODE = '42501';
    END IF;
    IF NEW."approvedById" IS DISTINCT FROM app.uid() THEN
      RAISE EXCEPTION 'approver must be the acting user' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER certificates_guard BEFORE INSERT OR UPDATE ON certificates
  FOR EACH ROW EXECUTE FUNCTION app.guard_certificate();

-- Answers follow their attempt.
ALTER TABLE assessment_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_scope ON assessment_answers FOR SELECT TO dar_app USING (
  EXISTS (SELECT 1 FROM assessment_attempts a WHERE a.id = "attemptId" AND app.can_read_student(a."studentId")));
CREATE POLICY self_write ON assessment_answers FOR INSERT TO dar_app WITH CHECK (
  EXISTS (SELECT 1 FROM assessment_attempts a WHERE a.id = "attemptId" AND app.is_student_self(a."studentId") AND a.status = 'IN_PROGRESS'));
CREATE POLICY self_update ON assessment_answers FOR UPDATE TO dar_app USING (
  EXISTS (SELECT 1 FROM assessment_attempts a WHERE a.id = "attemptId" AND app.is_student_self(a."studentId") AND a.status = 'IN_PROGRESS'));
CREATE POLICY grade ON assessment_answers FOR UPDATE TO dar_app USING (
  EXISTS (SELECT 1 FROM assessment_attempts a WHERE a.id = "attemptId" AND app.can_teach_student(a."studentId")));

-- ---------- People ----------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_scope ON users FOR SELECT TO dar_app USING (app.can_see_user(id));
CREATE POLICY self_update ON users FOR UPDATE TO dar_app USING (id = app.uid()) WITH CHECK (id = app.uid());
CREATE POLICY manage ON users FOR ALL TO dar_app USING (app.has_perm('users.manage')) WITH CHECK (app.has_perm('users.manage'));

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_scope ON students FOR SELECT TO dar_app USING (app.can_read_student(id));
CREATE POLICY manage ON students FOR ALL TO dar_app
  USING (app.has_perm_in_branch('users.manage', "branchId")) WITH CHECK (app.has_perm_in_branch('users.manage', "branchId"));
CREATE POLICY teacher_update ON students FOR UPDATE TO dar_app USING (app.teaches_student(id)) WITH CHECK (app.teaches_student(id));

ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_scope ON guardians FOR SELECT TO dar_app USING ("userId" = app.uid() OR app.can_see_user("userId"));
CREATE POLICY manage ON guardians FOR ALL TO dar_app USING (app.has_perm('guardians.link')) WITH CHECK (app.has_perm('guardians.link'));

ALTER TABLE guardian_student_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_scope ON guardian_student_links FOR SELECT TO dar_app USING (
  EXISTS (SELECT 1 FROM guardians g WHERE g.id = "guardianId" AND g."userId" = app.uid())
  OR app.can_read_student("studentId"));
CREATE POLICY request ON guardian_student_links FOR INSERT TO dar_app WITH CHECK (
  status = 'PENDING' AND EXISTS (SELECT 1 FROM guardians g WHERE g.id = "guardianId" AND g."userId" = app.uid()));
CREATE POLICY manage ON guardian_student_links FOR ALL TO dar_app
  USING (app.has_perm('guardians.link')) WITH CHECK (app.has_perm('guardians.link'));

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_all ON teachers FOR SELECT TO dar_app USING (app.uid() IS NOT NULL);
CREATE POLICY manage ON teachers FOR ALL TO dar_app USING (app.has_perm('users.manage')) WITH CHECK (app.has_perm('users.manage'));
CREATE POLICY self_update ON teachers FOR UPDATE TO dar_app USING ("userId" = app.uid()) WITH CHECK ("userId" = app.uid());

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_self ON user_roles FOR SELECT TO dar_app USING ("userId" = app.uid() OR app.has_perm('users.manage'));
CREATE POLICY manage ON user_roles FOR ALL TO dar_app USING (app.has_perm('roles.assign')) WITH CHECK (app.has_perm('roles.assign'));

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_all ON branches FOR SELECT TO dar_app USING (app.uid() IS NOT NULL);
CREATE POLICY manage ON branches FOR ALL TO dar_app USING (app.has_perm('branches.manage')) WITH CHECK (app.has_perm('branches.manage'));

-- ---------- Halaqas ----------
ALTER TABLE halaqas ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_all ON halaqas FOR SELECT TO dar_app USING (app.uid() IS NOT NULL);
CREATE POLICY manage ON halaqas FOR ALL TO dar_app
  USING (app.has_perm_in_branch('halaqas.manage', "branchId")) WITH CHECK (app.has_perm_in_branch('halaqas.manage', "branchId"));

ALTER TABLE halaqa_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_all ON halaqa_schedules FOR SELECT TO dar_app USING (app.uid() IS NOT NULL);
CREATE POLICY manage ON halaqa_schedules FOR ALL TO dar_app USING (app.can_manage_halaqa("halaqaId")) WITH CHECK (app.can_manage_halaqa("halaqaId"));

ALTER TABLE halaqa_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_scope ON halaqa_sessions FOR SELECT TO dar_app USING (
  app.can_manage_halaqa("halaqaId") OR app.teaches_halaqa("halaqaId") OR EXISTS (
    SELECT 1 FROM enrollments e WHERE e."halaqaId" = halaqa_sessions."halaqaId" AND e.status = 'ACTIVE'));
CREATE POLICY manage ON halaqa_sessions FOR ALL TO dar_app USING (app.can_manage_halaqa("halaqaId")) WITH CHECK (app.can_manage_halaqa("halaqaId"));
CREATE POLICY teacher_update ON halaqa_sessions FOR UPDATE TO dar_app USING (app.teaches_halaqa("halaqaId")) WITH CHECK (app.teaches_halaqa("halaqaId"));
CREATE POLICY teacher_insert ON halaqa_sessions FOR INSERT TO dar_app WITH CHECK (app.teaches_halaqa("halaqaId"));

-- Enrollment approval by branch staff (the student-scoped policies cover reads).
CREATE POLICY halaqa_manage ON enrollments FOR ALL TO dar_app
  USING (app.can_manage_halaqa("halaqaId")) WITH CHECK (app.can_manage_halaqa("halaqaId"));

-- ---------- Personal ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bookmarks','reading_positions','notification_preferences']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY own ON %I FOR ALL TO dar_app USING ("userId" = app.uid()) WITH CHECK ("userId" = app.uid())', t);
  END LOOP;
END $$;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY own ON notifications FOR SELECT TO dar_app USING ("userId" = app.uid());
CREATE POLICY own_read ON notifications FOR UPDATE TO dar_app USING ("userId" = app.uid()) WITH CHECK ("userId" = app.uid());

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY participants ON messages FOR SELECT TO dar_app USING ("senderId" = app.uid() OR "recipientId" = app.uid());
CREATE POLICY send ON messages FOR INSERT TO dar_app WITH CHECK ("senderId" = app.uid());
CREATE POLICY read_mark ON messages FOR UPDATE TO dar_app USING ("recipientId" = app.uid());

ALTER TABLE files ENABLE ROW LEVEL SECURITY;
CREATE POLICY own ON files FOR ALL TO dar_app USING ("ownerId" = app.uid()) WITH CHECK ("ownerId" = app.uid());
CREATE POLICY via_submission ON files FOR SELECT TO dar_app USING (EXISTS (
  SELECT 1 FROM recitation_submissions s WHERE s."fileId" = files.id AND app.can_read_student(s."studentId")));

-- ---------- Permission-gated global content ----------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('curriculums','plans.manage'), ('questions','assessments.manage'),
    ('settings','settings.manage'), ('content_pages','content.manage')) AS v(tbl, perm)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.tbl);
    EXECUTE format('CREATE POLICY manage ON %I FOR ALL TO dar_app USING (app.has_perm(%L)) WITH CHECK (app.has_perm(%L))', r.tbl, r.perm, r.perm);
  END LOOP;
END $$;
CREATE POLICY read_auth ON curriculums FOR SELECT TO dar_app USING (app.uid() IS NOT NULL);
-- Students read questions only through the attempt service with correctKey removed.
CREATE POLICY read_auth ON questions FOR SELECT TO dar_app USING (app.uid() IS NOT NULL);
REVOKE SELECT ON questions FROM dar_app;
GRANT SELECT (id, kind, type, level, tag, "promptAr", "promptEn", options, points, "isDemo", active, "createdAt") ON questions TO dar_app;
CREATE POLICY read_published ON content_pages FOR SELECT TO dar_app USING (status = 'PUBLISHED');
CREATE POLICY read_public ON settings FOR SELECT TO dar_app USING (true);

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_published ON assessments FOR SELECT TO dar_app USING (published OR app.has_perm('assessments.manage'));
CREATE POLICY manage ON assessments FOR ALL TO dar_app USING (app.has_perm('assessments.manage')) WITH CHECK (app.has_perm('assessments.manage'));
ALTER TABLE assessment_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_auth ON assessment_questions FOR SELECT TO dar_app USING (app.uid() IS NOT NULL);
CREATE POLICY manage ON assessment_questions FOR ALL TO dar_app USING (app.has_perm('assessments.manage')) WITH CHECK (app.has_perm('assessments.manage'));

ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY manage ON contact_messages FOR ALL TO dar_app USING (app.has_perm('settings.manage')) WITH CHECK (app.has_perm('settings.manage'));

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_audit ON audit_logs FOR SELECT TO dar_app USING (app.has_perm('audit.view'));
CREATE POLICY write_own ON audit_logs FOR INSERT TO dar_app WITH CHECK ("actorId" = app.uid());

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY enqueue ON jobs FOR INSERT TO dar_app WITH CHECK (app.uid() IS NOT NULL);

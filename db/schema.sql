-- NammaShale initial Cloudflare D1 schema
-- SQLite / D1. Apply locally first; use remote only after confirming the target database.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS institutions (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, name_kn TEXT,
 institution_type TEXT NOT NULL CHECK(institution_type IN ('government_school','private_school','supporting_organisation')),
 udise_code TEXT UNIQUE, district TEXT, taluk TEXT, village TEXT, address TEXT,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','pending_verification')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT, phone TEXT,
 preferred_language TEXT NOT NULL DEFAULT 'kn' CHECK(preferred_language IN ('kn','en')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','pending_verification')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE TABLE IF NOT EXISTS memberships (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), institution_id TEXT NOT NULL REFERENCES institutions(id),
 role TEXT NOT NULL CHECK(role IN ('platform_admin','headmaster','government_teacher','government_student','parent_guardian','private_principal','private_teacher','student_mentor','alumnus','community_volunteer','education_official')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','rejected','revoked')),
 approved_by TEXT REFERENCES users(id), approved_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id,institution_id,role)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id,status);
CREATE INDEX IF NOT EXISTS idx_memberships_institution ON memberships(institution_id,role,status);
CREATE TABLE IF NOT EXISTS academic_years (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), label TEXT NOT NULL,
 starts_on TEXT NOT NULL, ends_on TEXT NOT NULL, is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(institution_id,label)
);
CREATE TABLE IF NOT EXISTS school_classes (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
 class_name TEXT NOT NULL, section_name TEXT NOT NULL DEFAULT 'A', class_teacher_membership_id TEXT REFERENCES memberships(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(institution_id,academic_year_id,class_name,section_name)
);
CREATE TABLE IF NOT EXISTS students (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), admission_number TEXT NOT NULL,
 user_id TEXT REFERENCES users(id), full_name TEXT NOT NULL, full_name_kn TEXT, date_of_birth TEXT, gender TEXT,
 class_id TEXT REFERENCES school_classes(id), admission_date TEXT,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','transferred','graduated','withdrawn')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(institution_id,admission_number)
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(institution_id,class_id,status);
CREATE TABLE IF NOT EXISTS guardians (
 id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), full_name TEXT NOT NULL, phone TEXT, relationship TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS student_guardians (
 student_id TEXT NOT NULL REFERENCES students(id), guardian_id TEXT NOT NULL REFERENCES guardians(id),
 is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)), can_receive_updates INTEGER NOT NULL DEFAULT 1 CHECK(can_receive_updates IN (0,1)),
 PRIMARY KEY(student_id,guardian_id)
);
CREATE TABLE IF NOT EXISTS attendance_records (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), student_id TEXT NOT NULL REFERENCES students(id),
 class_id TEXT NOT NULL REFERENCES school_classes(id), attendance_date TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('present','absent','leave','late')),
 recorded_by_membership_id TEXT NOT NULL REFERENCES memberships(id), note TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(student_id,attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance_records(institution_id,class_id,attendance_date);
CREATE TABLE IF NOT EXISTS assessments (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
 class_id TEXT NOT NULL REFERENCES school_classes(id), title TEXT NOT NULL, subject TEXT NOT NULL, assessment_type TEXT NOT NULL,
 max_marks REAL NOT NULL CHECK(max_marks>0), held_on TEXT, created_by_membership_id TEXT NOT NULL REFERENCES memberships(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS assessment_results (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), assessment_id TEXT NOT NULL REFERENCES assessments(id),
 student_id TEXT NOT NULL REFERENCES students(id), marks_obtained REAL CHECK(marks_obtained>=0), grade TEXT, remarks TEXT,
 entered_by_membership_id TEXT NOT NULL REFERENCES memberships(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(assessment_id,student_id)
);
CREATE TABLE IF NOT EXISTS notices (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), title TEXT NOT NULL, body TEXT NOT NULL,
 audience TEXT NOT NULL DEFAULT 'school' CHECK(audience IN ('school','teachers','parents','students','community')),
 published_by_membership_id TEXT NOT NULL REFERENCES memberships(id), published_at TEXT, expires_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS school_events (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), title TEXT NOT NULL, description TEXT,
 starts_at TEXT NOT NULL, ends_at TEXT, venue TEXT, audience TEXT NOT NULL DEFAULT 'school',
 created_by_membership_id TEXT NOT NULL REFERENCES memberships(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS school_needs (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), title TEXT NOT NULL, description TEXT,
 category TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
 estimated_amount_paise INTEGER, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','in_progress','fulfilled','declined')),
 submitted_by_membership_id TEXT NOT NULL REFERENCES memberships(id), approved_by_membership_id TEXT REFERENCES memberships(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS development_projects (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), need_id TEXT REFERENCES school_needs(id),
 title TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','active','completed','on_hold','cancelled')),
 owner_membership_id TEXT REFERENCES memberships(id), starts_on TEXT, target_date TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS project_milestones (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), project_id TEXT NOT NULL REFERENCES development_projects(id),
 title TEXT NOT NULL, due_date TEXT, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','blocked')),
 evidence_object_key TEXT, updated_by_membership_id TEXT REFERENCES memberships(id), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS volunteer_assignments (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), project_id TEXT NOT NULL REFERENCES development_projects(id),
 volunteer_membership_id TEXT NOT NULL REFERENCES memberships(id), task_description TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'offered' CHECK(status IN ('offered','accepted','in_progress','completed','withdrawn')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS contribution_records (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), project_id TEXT REFERENCES development_projects(id),
 contributor_membership_id TEXT REFERENCES memberships(id), contribution_type TEXT NOT NULL CHECK(contribution_type IN ('time','materials','service','funds')),
 description TEXT NOT NULL, amount_paise INTEGER,
 verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK(verification_status IN ('unverified','verified','rejected')),
 recorded_by_membership_id TEXT NOT NULL REFERENCES memberships(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS institution_partnerships (
 id TEXT PRIMARY KEY, government_institution_id TEXT NOT NULL REFERENCES institutions(id), partner_institution_id TEXT NOT NULL REFERENCES institutions(id),
 title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','under_review','approved','active','completed','rejected','suspended')),
 objectives TEXT, starts_on TEXT, ends_on TEXT, created_by_membership_id TEXT NOT NULL REFERENCES memberships(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(government_institution_id<>partner_institution_id)
);
CREATE TABLE IF NOT EXISTS partnership_approvals (
 id TEXT PRIMARY KEY, partnership_id TEXT NOT NULL REFERENCES institution_partnerships(id), institution_id TEXT NOT NULL REFERENCES institutions(id),
 approver_membership_id TEXT NOT NULL REFERENCES memberships(id), decision TEXT NOT NULL CHECK(decision IN ('approved','rejected','needs_changes')),
 comments TEXT, decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS partnership_activities (
 id TEXT PRIMARY KEY, partnership_id TEXT NOT NULL REFERENCES institution_partnerships(id),
 activity_type TEXT NOT NULL CHECK(activity_type IN ('teacher_exchange','student_mentoring','workshop','infrastructure','academic_support','other')),
 title TEXT NOT NULL, description TEXT, supervising_teacher_membership_id TEXT REFERENCES memberships(id),
 starts_at TEXT, ends_at TEXT, status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','approved','active','completed','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mentoring_programmes (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), partnership_id TEXT REFERENCES institution_partnerships(id),
 title TEXT NOT NULL, description TEXT, subject_area TEXT, supervising_teacher_membership_id TEXT NOT NULL REFERENCES memberships(id),
 guardian_consent_required INTEGER NOT NULL DEFAULT 1 CHECK(guardian_consent_required IN (0,1)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','active','completed','cancelled')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS mentoring_assignments (
 id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES mentoring_programmes(id),
 mentor_membership_id TEXT NOT NULL REFERENCES memberships(id), mentee_student_id TEXT NOT NULL REFERENCES students(id),
 consent_record_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(programme_id,mentor_membership_id,mentee_student_id)
);
CREATE TABLE IF NOT EXISTS mentoring_sessions (
 id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES mentoring_programmes(id),
 assignment_id TEXT REFERENCES mentoring_assignments(id), session_at TEXT NOT NULL, summary TEXT,
 recorded_by_membership_id TEXT NOT NULL REFERENCES memberships(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS consent_records (
 id TEXT PRIMARY KEY, institution_id TEXT NOT NULL REFERENCES institutions(id), student_id TEXT REFERENCES students(id),
 guardian_id TEXT REFERENCES guardians(id), subject_type TEXT NOT NULL, purpose TEXT NOT NULL,
 consent_status TEXT NOT NULL CHECK(consent_status IN ('granted','withdrawn','declined','expired')),
 captured_by_membership_id TEXT REFERENCES memberships(id), captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at TEXT, evidence_object_key TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id TEXT PRIMARY KEY, institution_id TEXT REFERENCES institutions(id), actor_user_id TEXT REFERENCES users(id),
 actor_membership_id TEXT REFERENCES memberships(id), action TEXT NOT NULL, resource_type TEXT NOT NULL,
 resource_id TEXT, outcome TEXT NOT NULL DEFAULT 'success', metadata_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_institution_created ON audit_logs(institution_id,created_at);

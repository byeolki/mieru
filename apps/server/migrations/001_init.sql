CREATE TABLE users (
  id                    CHAR(36) CHARACTER SET ascii NOT NULL,
  email                 VARCHAR(320) NOT NULL,
  email_normalized      VARCHAR(320) COLLATE utf8mb4_bin NOT NULL,     -- trimmed + lowercased; login identifier
  password_hash         VARCHAR(255) NOT NULL,
  username              VARCHAR(30) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL, -- public handle, generated at signup
  username_changed_at   DATETIME(3) NULL,
  display_name          VARCHAR(100) NOT NULL,
  bio                   VARCHAR(300) NULL,
  avatar_key            CHAR(36) CHARACTER SET ascii NULL,              -- uploaded avatar under blobs/ (P1); NULL = generated avatar
  role                  ENUM('user','admin') NOT NULL DEFAULT 'user',
  failed_login_count    INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until          DATETIME(3) NULL,
  password_changed_at   DATETIME(3) NULL,
  created_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email_normalized (email_normalized),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Usernames freed by renames or deletions stay reserved for 30 days (anti-impersonation).
CREATE TABLE released_usernames (
  username     VARCHAR(30) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  released_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE refresh_tokens (
  id                CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id           CHAR(36) CHARACTER SET ascii NOT NULL,
  family_id         CHAR(36) CHARACTER SET ascii NOT NULL,
  token_hash        BINARY(32) NOT NULL,
  replaced_by_id    CHAR(36) CHARACTER SET ascii NULL,
  rotated_at        DATETIME(3) NULL,
  revoked_at        DATETIME(3) NULL,
  revoke_reason     ENUM('logout','logout_all','reuse_detected','password_changed','account_deleted','session_revoked') NULL,
  expires_at        DATETIME(3) NOT NULL,                      -- 30 d per token
  family_expires_at DATETIME(3) NOT NULL,                      -- 90 d per session
  user_agent        VARCHAR(255) NULL,
  ip                VARCHAR(45) CHARACTER SET ascii NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_token_hash (token_hash),
  KEY ix_refresh_family (family_id),
  KEY ix_refresh_user (user_id),
  KEY ix_refresh_expires (expires_at),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE blobs (
  id              CHAR(36) CHARACTER SET ascii NOT NULL,
  storage_key     CHAR(36) CHARACTER SET ascii NOT NULL,
  sha256          BINARY(32) NOT NULL,
  size_bytes      BIGINT UNSIGNED NOT NULL,
  format          ENUM('onnx','safetensors','labels_json') NOT NULL,
  parser_version  SMALLINT UNSIGNED NULL,
  total_params    BIGINT UNSIGNED NULL,
  node_count      INT UNSIGNED NULL,
  tensor_count    INT UNSIGNED NULL,
  summary         JSON NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_blobs_storage_key (storage_key),
  UNIQUE KEY uq_blobs_sha256 (sha256)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- A model repository.
CREATE TABLE models (
  id                     CHAR(36) CHARACTER SET ascii NOT NULL,
  owner_id               CHAR(36) CHARACTER SET ascii NOT NULL,
  name                   VARCHAR(200) NOT NULL,
  description            VARCHAR(500) NULL,
  readme_md              MEDIUMTEXT NULL,                       -- ≤ 256 KiB enforced in the service
  readme_updated_at      DATETIME(3) NULL,
  readme_updated_by      CHAR(36) CHARACTER SET ascii NULL,
  license                VARCHAR(64) CHARACTER SET ascii NULL,  -- SPDX id
  visibility             ENUM('private','users','link','public') NOT NULL DEFAULT 'private',
  public_allow_download  TINYINT(1) NOT NULL DEFAULT 1,         -- only consulted when visibility = 'public'
  current_version_id     CHAR(36) CHARACTER SET ascii NULL,
  star_count             INT UNSIGNED NOT NULL DEFAULT 0,       -- updated with stars in one transaction
  open_issue_count       INT UNSIGNED NOT NULL DEFAULT 0,
  next_issue_number      INT UNSIGNED NOT NULL DEFAULT 1,
  published_at           DATETIME(3) NULL,                      -- first time it became public (Explore "new")
  taken_down_at          DATETIME(3) NULL,
  taken_down_reason      VARCHAR(500) NULL,
  created_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_models_owner_updated (owner_id, updated_at),
  KEY ix_models_public_published (visibility, taken_down_at, published_at),
  KEY ix_models_public_stars (visibility, taken_down_at, star_count),
  FULLTEXT KEY ft_models_search (name, description, readme_md) WITH PARSER ngram,
  CONSTRAINT fk_models_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_models_readme_editor FOREIGN KEY (readme_updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE model_versions (
  id              CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id        CHAR(36) CHARACTER SET ascii NOT NULL,
  version_number  INT UNSIGNED NOT NULL,
  status          ENUM('processing','ready','failed') NOT NULL DEFAULT 'processing',
  failure_reason  VARCHAR(64) CHARACTER SET ascii NULL,
  upload_id       CHAR(36) CHARACTER SET ascii NULL,
  original_name   VARCHAR(255) NOT NULL,
  note            VARCHAR(500) NULL,
  created_by      CHAR(36) CHARACTER SET ascii NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_versions_model_number (model_id, version_number),
  KEY ix_versions_status (status, created_at),
  CONSTRAINT fk_versions_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_versions_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE models
  ADD CONSTRAINT fk_models_current_version FOREIGN KEY (current_version_id) REFERENCES model_versions (id) ON DELETE SET NULL;

CREATE TABLE model_files (
  id             CHAR(36) CHARACTER SET ascii NOT NULL,
  version_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  kind           ENUM('model','labels') NOT NULL,
  blob_id        CHAR(36) CHARACTER SET ascii NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_model_files_version_kind (version_id, kind),
  KEY ix_model_files_blob (blob_id),
  CONSTRAINT fk_model_files_version FOREIGN KEY (version_id) REFERENCES model_versions (id) ON DELETE CASCADE,
  CONSTRAINT fk_model_files_blob FOREIGN KEY (blob_id) REFERENCES blobs (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE uploads (
  id               CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id          CHAR(36) CHARACTER SET ascii NOT NULL,
  target_model_id  CHAR(36) CHARACTER SET ascii NULL,         -- P1: new version of this repository
  original_name    VARCHAR(255) NOT NULL,
  declared_size    BIGINT UNSIGNED NOT NULL,
  completed_at     DATETIME(3) NULL,
  consumed_at      DATETIME(3) NULL,
  expires_at       DATETIME(3) NOT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_uploads_user (user_id, consumed_at),
  KEY ix_uploads_target (target_model_id, consumed_at),
  KEY ix_uploads_expires (expires_at),
  CONSTRAINT fk_uploads_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_uploads_target FOREIGN KEY (target_model_id) REFERENCES models (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE shares (
  model_id        CHAR(36) CHARACTER SET ascii NOT NULL,
  user_id         CHAR(36) CHARACTER SET ascii NOT NULL,
  role            ENUM('viewer','editor') NOT NULL,
  allow_download  TINYINT(1) NOT NULL DEFAULT 1,              -- forced to 1 for editors in the service
  created_by      CHAR(36) CHARACTER SET ascii NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (model_id, user_id),
  KEY ix_shares_user (user_id, created_at),
  CONSTRAINT fk_shares_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_shares_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_shares_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE share_links (
  id                CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id          CHAR(36) CHARACTER SET ascii NOT NULL,
  token_hash        BINARY(32) NOT NULL,
  token_ciphertext  VARBINARY(128) NOT NULL,                   -- AES-256-GCM(iv|tag|ct)
  label             VARCHAR(100) NULL,
  role              ENUM('viewer','editor') NOT NULL DEFAULT 'viewer',
  allow_download    TINYINT(1) NOT NULL DEFAULT 0,
  expires_at        DATETIME(3) NULL,
  revoked_at        DATETIME(3) NULL,
  last_used_at      DATETIME(3) NULL,
  created_by        CHAR(36) CHARACTER SET ascii NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_share_links_token_hash (token_hash),
  KEY ix_share_links_model (model_id),
  CONSTRAINT fk_share_links_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_share_links_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE link_visits (
  user_id          CHAR(36) CHARACTER SET ascii NOT NULL,
  link_id          CHAR(36) CHARACTER SET ascii NOT NULL,
  first_opened_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_opened_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, link_id),
  KEY ix_link_visits_link (link_id),
  CONSTRAINT fk_link_visits_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_link_visits_link FOREIGN KEY (link_id) REFERENCES share_links (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE issues (
  id            CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id      CHAR(36) CHARACTER SET ascii NOT NULL,
  number        INT UNSIGNED NOT NULL,                         -- #1, #2 … per repository
  kind          ENUM('bug','question','feedback') NOT NULL,
  title         VARCHAR(200) NOT NULL,
  body_md       TEXT NOT NULL,                                 -- ≤ 64 KiB
  node_ref      VARCHAR(512) NULL,                             -- ONNX node name or safetensors module path
  state         ENUM('open','closed') NOT NULL DEFAULT 'open',
  closed_at     DATETIME(3) NULL,
  closed_by     CHAR(36) CHARACTER SET ascii NULL,
  locked_at     DATETIME(3) NULL,                              -- locked: no new replies
  author_id     CHAR(36) CHARACTER SET ascii NULL,             -- NULL = deleted account
  reply_count   INT UNSIGNED NOT NULL DEFAULT 0,
  last_activity_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at    DATETIME(3) NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_issues_model_number (model_id, number),
  KEY ix_issues_model_state (model_id, state, last_activity_at),
  KEY ix_issues_model_node (model_id, node_ref(191)),
  KEY ix_issues_author (author_id, last_activity_at),
  CONSTRAINT fk_issues_model  FOREIGN KEY (model_id)  REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_issues_author FOREIGN KEY (author_id) REFERENCES users (id)  ON DELETE SET NULL,
  CONSTRAINT fk_issues_closer FOREIGN KEY (closed_by) REFERENCES users (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE issue_replies (
  id          CHAR(36) CHARACTER SET ascii NOT NULL,
  issue_id    CHAR(36) CHARACTER SET ascii NOT NULL,
  author_id   CHAR(36) CHARACTER SET ascii NULL,
  body_md     TEXT NOT NULL,                                   -- ≤ 16 KiB
  deleted_at  DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_issue_replies_issue (issue_id, created_at),
  KEY ix_issue_replies_author (author_id, created_at),
  CONSTRAINT fk_issue_replies_issue  FOREIGN KEY (issue_id)  REFERENCES issues (id) ON DELETE CASCADE,
  CONSTRAINT fk_issue_replies_author FOREIGN KEY (author_id) REFERENCES users (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Unread tracking for the dashboard Activity feed.
CREATE TABLE issue_reads (
  user_id       CHAR(36) CHARACTER SET ascii NOT NULL,
  issue_id      CHAR(36) CHARACTER SET ascii NOT NULL,
  last_read_at  DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id, issue_id),
  CONSTRAINT fk_issue_reads_user  FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE,
  CONSTRAINT fk_issue_reads_issue FOREIGN KEY (issue_id) REFERENCES issues (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE stars (
  user_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id    CHAR(36) CHARACTER SET ascii NOT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, model_id),
  KEY ix_stars_model_created (model_id, created_at),
  CONSTRAINT fk_stars_user  FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE,
  CONSTRAINT fk_stars_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One row per unique viewer per model per day; purged after 30 days.
CREATE TABLE model_view_days (
  model_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  day          DATE NOT NULL,
  viewer_hash  BINARY(16) NOT NULL,                            -- SHA-256(user id | ip+ua, daily salt)[:16]
  PRIMARY KEY (model_id, day, viewer_hash),
  KEY ix_view_days_day (day),
  CONSTRAINT fk_view_days_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE model_trending (
  model_id      CHAR(36) CHARACTER SET ascii NOT NULL,
  score         DOUBLE NOT NULL,
  stars_7d      INT UNSIGNED NOT NULL,
  views_7d      INT UNSIGNED NOT NULL,
  issues_7d     INT UNSIGNED NOT NULL,
  computed_at   DATETIME(3) NOT NULL,
  PRIMARY KEY (model_id),
  KEY ix_trending_score (score),
  CONSTRAINT fk_trending_model FOREIGN KEY (model_id) REFERENCES models (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE reports (
  id           CHAR(36) CHARACTER SET ascii NOT NULL,
  model_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  issue_id     CHAR(36) CHARACTER SET ascii NULL,             -- set when an issue (not the repository) is reported
  reporter_id  CHAR(36) CHARACTER SET ascii NULL,
  reason       ENUM('malware','copyright','illegal','spam','abuse','other') NOT NULL,
  details      VARCHAR(2000) NULL,
  status       ENUM('open','dismissed','actioned') NOT NULL DEFAULT 'open',
  resolved_by  CHAR(36) CHARACTER SET ascii NULL,
  resolved_at  DATETIME(3) NULL,
  reporter_ip  VARCHAR(45) CHARACTER SET ascii NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_reports_status (status, created_at),
  KEY ix_reports_model (model_id),
  CONSTRAINT fk_reports_model    FOREIGN KEY (model_id)    REFERENCES models (id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_issue    FOREIGN KEY (issue_id)    REFERENCES issues (id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id)  ON DELETE SET NULL,
  CONSTRAINT fk_reports_resolver FOREIGN KEY (resolved_by) REFERENCES users (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE audit_events (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id    CHAR(36) CHARACTER SET ascii NULL,
  action      VARCHAR(64) CHARACTER SET ascii NOT NULL,
  target_type VARCHAR(32) CHARACTER SET ascii NULL,
  target_id   CHAR(36) CHARACTER SET ascii NULL,
  ip          VARCHAR(45) CHARACTER SET ascii NULL,
  meta        JSON NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_audit_actor (actor_id, created_at),
  KEY ix_audit_target (target_type, target_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

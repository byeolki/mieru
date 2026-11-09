-- Design mode: sequential models drawn in the browser, stored as a validated JSON spec.
CREATE TABLE designs (
  id          CHAR(36) CHARACTER SET ascii NOT NULL,
  owner_id    CHAR(36) CHARACTER SET ascii NOT NULL,
  name        VARCHAR(200) NOT NULL,
  spec        JSON NOT NULL,
  visibility  ENUM('private','public') NOT NULL DEFAULT 'private',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_designs_owner (owner_id, updated_at),
  CONSTRAINT fk_designs_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

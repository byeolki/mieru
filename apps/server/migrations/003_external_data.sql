-- External data: a version holds its .onnx plus the files its tensors point into.
ALTER TABLE model_files
  MODIFY kind ENUM('model','labels','external_data') NOT NULL,
  ADD UNIQUE KEY uq_model_files_version_kind_name (version_id, kind, original_name),
  DROP INDEX uq_model_files_version_kind;

ALTER TABLE blobs
  MODIFY format ENUM('onnx','safetensors','labels_json','onnx_data') NOT NULL;

ALTER TABLE uploads
  ADD COLUMN role ENUM('model','external_data') NOT NULL DEFAULT 'model' AFTER target_model_id;

-- Names of the data files a failed version was missing, shown next to the failure reason.
ALTER TABLE model_versions
  ADD COLUMN failure_detail VARCHAR(1000) NULL AFTER failure_reason;

-- Data uploads waiting with a processing version; their blobs land in model_files when it publishes.
CREATE TABLE version_data_uploads (
  version_id     CHAR(36) CHARACTER SET ascii NOT NULL,
  upload_id      CHAR(36) CHARACTER SET ascii NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  PRIMARY KEY (version_id, upload_id),
  CONSTRAINT fk_version_data_uploads_version FOREIGN KEY (version_id) REFERENCES model_versions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- +goose Up
ALTER TABLE existencias_inventario
    ADD COLUMN version uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE existencias_inventario
    ALTER COLUMN version DROP DEFAULT;

-- +goose Down
ALTER TABLE existencias_inventario DROP COLUMN version;

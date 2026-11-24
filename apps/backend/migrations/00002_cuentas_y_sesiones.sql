-- +goose Up
ALTER TABLE usuarios
    ADD COLUMN cuenta text UNIQUE CHECK (cuenta ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
    ADD COLUMN clave_derivada text,
    ADD CONSTRAINT usuarios_credenciales_completas CHECK ((cuenta IS NULL) = (clave_derivada IS NULL));

CREATE TABLE sesiones (
    huella text PRIMARY KEY CHECK (huella ~ '^[0-9a-f]{64}$'),
    usuario_id uuid NOT NULL REFERENCES usuarios (id),
    vence_en timestamptz NOT NULL
);

CREATE INDEX sesiones_por_usuario ON sesiones (usuario_id);

-- +goose Down
DROP TABLE sesiones;

ALTER TABLE usuarios
    DROP CONSTRAINT usuarios_credenciales_completas,
    DROP COLUMN clave_derivada,
    DROP COLUMN cuenta;

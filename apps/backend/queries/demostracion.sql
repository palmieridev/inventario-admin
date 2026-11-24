-- name: InsertarNegocioDemostracion :exec
INSERT INTO negocios (id, nombre)
VALUES (sqlc.arg(negocio_id), sqlc.arg(nombre))
ON CONFLICT (id) DO NOTHING;

-- name: BloquearNegocioDemostracion :exec
SELECT id FROM negocios WHERE id = sqlc.arg(negocio_id) FOR UPDATE;

-- name: BuscarCuentaDemostracion :one
SELECT negocio_id, rol FROM usuarios WHERE cuenta = sqlc.arg(cuenta);

-- name: InsertarCuentaDemostracion :exec
INSERT INTO usuarios (negocio_id, nombre, cuenta, clave_derivada, rol)
VALUES (sqlc.arg(negocio_id), sqlc.arg(nombre), sqlc.arg(cuenta), sqlc.arg(clave_derivada), sqlc.arg(rol));

-- name: InsertarPrimeraJornada :one
INSERT INTO jornadas (negocio_id)
SELECT sqlc.arg(negocio_id)::uuid
WHERE NOT EXISTS (SELECT 1 FROM jornadas WHERE negocio_id = sqlc.arg(negocio_id))
RETURNING id;

-- name: BuscarUsuarioActivo :one
SELECT id, negocio_id, nombre, rol
FROM usuarios
WHERE activo AND id = sqlc.arg(usuario_id)
FOR SHARE;

-- name: BuscarUsuarioDeSesion :one
SELECT id, negocio_id, nombre, rol
FROM usuarios
WHERE activo AND id = (SELECT usuario_id FROM sesiones WHERE huella = sqlc.arg(huella))
FOR SHARE;

-- name: BuscarSesionVigente :one
SELECT huella
FROM sesiones
WHERE huella = sqlc.arg(huella) AND usuario_id = sqlc.arg(usuario_id)
  AND vence_en > clock_timestamp()
FOR SHARE;

-- name: BuscarCredencialActiva :one
SELECT id, clave_derivada FROM usuarios WHERE cuenta = sqlc.arg(cuenta) AND activo;

-- name: BloquearCredencialVigente :one
SELECT id, negocio_id, nombre, rol
FROM usuarios
WHERE id = sqlc.arg(usuario_id) AND activo AND clave_derivada = sqlc.arg(clave_derivada)
FOR SHARE;

-- name: EliminarSesionesExpiradas :exec
DELETE FROM sesiones WHERE usuario_id = sqlc.arg(usuario_id) AND vence_en <= clock_timestamp();

-- name: CrearSesion :exec
INSERT INTO sesiones (huella, usuario_id, vence_en)
VALUES (sqlc.arg(huella), sqlc.arg(usuario_id), clock_timestamp() + sqlc.arg(duracion_segundos)::integer * interval '1 second');

-- name: BloquearSesion :one
SELECT usuario_id FROM sesiones WHERE huella = sqlc.arg(huella) FOR UPDATE;

-- name: EliminarSesion :exec
DELETE FROM sesiones WHERE huella = sqlc.arg(huella);

-- name: ListarPersonal :many
SELECT id, nombre, cuenta, activo
FROM usuarios
WHERE negocio_id = sqlc.arg(negocio_id) AND rol = 'staff'
ORDER BY nombre, id;

-- name: CrearPersonal :one
INSERT INTO usuarios (negocio_id, nombre, cuenta, clave_derivada, rol)
VALUES (sqlc.arg(negocio_id), sqlc.arg(nombre), sqlc.arg(cuenta), sqlc.arg(clave_derivada), 'staff')
RETURNING id, nombre, cuenta, activo;

-- name: BloquearPersonal :one
SELECT id, nombre, cuenta, activo
FROM usuarios
WHERE negocio_id = sqlc.arg(negocio_id) AND id = sqlc.arg(usuario_id) AND rol = 'staff'
FOR UPDATE;

-- name: ActualizarAccesoPersonal :one
UPDATE usuarios
SET activo = sqlc.arg(activo),
    cuenta = COALESCE(sqlc.narg(cuenta), cuenta),
    clave_derivada = COALESCE(sqlc.narg(clave_derivada), clave_derivada)
WHERE id = sqlc.arg(usuario_id)
RETURNING id, nombre, cuenta, activo;

-- name: EliminarSesionesDeUsuario :exec
DELETE FROM sesiones WHERE usuario_id = sqlc.arg(usuario_id);

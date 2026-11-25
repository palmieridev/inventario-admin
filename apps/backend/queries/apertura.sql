-- name: BuscarAperturaPorClave :one
SELECT o.id AS operacion_id, o.autor_id, o.jornada_id, o.registrada_en, a.elemento_id, a.unidad_id,
       a.cantidad
FROM operaciones_inventario AS o
LEFT JOIN aperturas_inventario AS a ON a.negocio_id = o.negocio_id AND a.operacion_id = o.id
WHERE o.negocio_id = sqlc.arg(negocio_id) AND o.clave_reintento = sqlc.arg(clave_reintento);

-- name: ListarJornadasAbiertas :many
SELECT id, iniciada_en
FROM jornadas
WHERE negocio_id = sqlc.arg(negocio_id) AND iniciada_en <= CURRENT_TIMESTAMP AND cerrada_en IS NULL
ORDER BY iniciada_en DESC, id;

-- name: LeerJornadaBloqueada :one
SELECT (iniciada_en <= CURRENT_TIMESTAMP)::boolean AS iniciada, cerrada_en
FROM jornadas
WHERE negocio_id = sqlc.arg(negocio_id) AND id = sqlc.arg(jornada_id)
FOR SHARE;

-- name: RegistrarOperacion :one
INSERT INTO operaciones_inventario (negocio_id, autor_id, jornada_id, tipo, clave_reintento)
VALUES (sqlc.arg(negocio_id), sqlc.arg(autor_id), sqlc.arg(jornada_id), sqlc.arg(tipo), sqlc.arg(clave_reintento))
ON CONFLICT (negocio_id, clave_reintento) DO NOTHING
RETURNING id, registrada_en;

-- name: InsertarApertura :one
INSERT INTO aperturas_inventario (negocio_id, elemento_id, unidad_id, operacion_id, cantidad)
VALUES (sqlc.arg(negocio_id), sqlc.arg(elemento_id), sqlc.arg(unidad_id), sqlc.arg(operacion_id), sqlc.arg(cantidad))
ON CONFLICT (negocio_id, elemento_id) DO NOTHING
RETURNING elemento_id;

-- name: InsertarExistencia :exec
INSERT INTO existencias_inventario (negocio_id, elemento_id, cantidad, actualizada_en, version)
SELECT sqlc.arg(negocio_id), sqlc.arg(elemento_id)::uuid, sqlc.arg(cantidad)::numeric, registrada_en, id
FROM operaciones_inventario
WHERE negocio_id = sqlc.arg(negocio_id) AND id = sqlc.arg(operacion_id);

-- name: BuscarExistencia :one
SELECT e.id AS elemento_id, e.unidad_id, s.cantidad, s.actualizada_en, s.version
FROM elementos_inventario AS e
LEFT JOIN existencias_inventario AS s ON s.negocio_id = e.negocio_id AND s.elemento_id = e.id
WHERE e.negocio_id = sqlc.arg(negocio_id) AND e.id = sqlc.arg(elemento_id)
  AND (e.activo OR sqlc.arg(incluir_inactivos)::boolean);

-- name: BuscarUnidad :one
SELECT id FROM unidades_medida WHERE negocio_id = sqlc.arg(negocio_id) AND id = sqlc.arg(unidad_id);

-- name: ListarUnidades :many
SELECT id, nombre, simbolo, decimales
FROM unidades_medida
WHERE negocio_id = sqlc.arg(negocio_id)
ORDER BY nombre, id;

-- name: CrearUnidad :one
INSERT INTO unidades_medida (negocio_id, nombre, simbolo, decimales)
VALUES (sqlc.arg(negocio_id), sqlc.arg(nombre), sqlc.arg(simbolo), sqlc.arg(decimales))
RETURNING id, nombre, simbolo, decimales;

-- name: BloquearUnidad :one
SELECT id, nombre, simbolo, decimales
FROM unidades_medida
WHERE negocio_id = sqlc.arg(negocio_id) AND id = sqlc.arg(unidad_id)
FOR UPDATE;

-- name: BuscarAperturaDeUnidad :one
SELECT elemento_id
FROM aperturas_inventario
WHERE negocio_id = sqlc.arg(negocio_id) AND unidad_id = sqlc.arg(unidad_id)
LIMIT 1;

-- name: ActualizarUnidad :one
UPDATE unidades_medida
SET nombre = sqlc.arg(nombre), simbolo = sqlc.arg(simbolo), decimales = sqlc.arg(decimales)
WHERE negocio_id = sqlc.arg(negocio_id) AND id = sqlc.arg(unidad_id)
RETURNING id, nombre, simbolo, decimales;

-- name: ListarElementos :many
SELECT id, unidad_id, categoria, nombre, variante, activo
FROM elementos_inventario
WHERE negocio_id = sqlc.arg(negocio_id) AND (activo OR sqlc.arg(incluir_inactivos)::boolean)
ORDER BY categoria, nombre, variante, id;

-- name: CrearElemento :one
INSERT INTO elementos_inventario (negocio_id, unidad_id, categoria, nombre, variante, activo)
VALUES (sqlc.arg(negocio_id), sqlc.arg(unidad_id), sqlc.arg(categoria), sqlc.arg(nombre),
        sqlc.narg(variante), sqlc.arg(activo))
RETURNING id, unidad_id, categoria, nombre, variante, activo;

-- name: BloquearElemento :one
SELECT id, unidad_id, categoria, nombre, variante, activo
FROM elementos_inventario
WHERE negocio_id = sqlc.arg(negocio_id) AND id = sqlc.arg(elemento_id)
FOR UPDATE;

-- name: BuscarAperturaDeElemento :one
SELECT elemento_id
FROM aperturas_inventario
WHERE negocio_id = sqlc.arg(negocio_id) AND elemento_id = sqlc.arg(elemento_id);

-- name: ActualizarElemento :one
UPDATE elementos_inventario
SET unidad_id = sqlc.arg(unidad_id), categoria = sqlc.arg(categoria), nombre = sqlc.arg(nombre),
    variante = sqlc.narg(variante), activo = sqlc.arg(activo)
WHERE negocio_id = sqlc.arg(negocio_id) AND id = sqlc.arg(elemento_id)
RETURNING id, unidad_id, categoria, nombre, variante, activo;

-- name: LeerUnidadBloqueada :one
SELECT nombre, simbolo, decimales
FROM unidades_medida
WHERE negocio_id = sqlc.arg(negocio_id) AND id = sqlc.arg(unidad_id)
FOR SHARE;

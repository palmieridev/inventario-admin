-- name: BuscarMovimiento :one
SELECT o.id AS operacion_id, o.autor_id, o.jornada_id, o.tipo, o.registrada_en, m.motivo, m.observacion
FROM operaciones_inventario AS o
JOIN movimientos_inventario AS m ON m.negocio_id = o.negocio_id AND m.operacion_id = o.id
WHERE o.negocio_id = sqlc.arg(negocio_id) AND o.id = sqlc.arg(operacion_id);

-- name: ListarLineasMovimiento :many
SELECT elemento_id, unidad_id, saldo_anterior::text AS saldo_anterior,
       saldo_resultante::text AS saldo_resultante, variacion::text AS variacion
FROM lineas_movimiento
WHERE negocio_id = sqlc.arg(negocio_id) AND operacion_id = sqlc.arg(operacion_id)
ORDER BY elemento_id;

-- name: BuscarReintentoMovimiento :one
SELECT o.id, COALESCE(o.autor_id = sqlc.arg(autor_id) AND m.solicitud = sqlc.arg(solicitud)::text::jsonb, false)::boolean AS coincide
FROM operaciones_inventario AS o
LEFT JOIN movimientos_inventario AS m ON m.negocio_id = o.negocio_id AND m.operacion_id = o.id
WHERE o.negocio_id = sqlc.arg(negocio_id) AND o.clave_reintento = sqlc.arg(clave_reintento);

-- name: InsertarMovimiento :exec
INSERT INTO movimientos_inventario (negocio_id, operacion_id, solicitud, motivo, observacion)
VALUES (sqlc.arg(negocio_id), sqlc.arg(operacion_id), sqlc.arg(solicitud)::text::jsonb,
        sqlc.narg(motivo), sqlc.narg(observacion));

-- name: CalcularSaldoBloqueado :one
SELECT e.cantidad::text AS anterior, c.calculo::text AS siguiente, e.version,
       (c.calculo < 0)::boolean AS insuficiente, (c.calculo >= 1000000000000)::boolean AS excedido
FROM existencias_inventario AS e
CROSS JOIN LATERAL (
    SELECT CASE sqlc.arg(efecto)::text
        WHEN 'sumar' THEN e.cantidad + sqlc.arg(cantidad)::numeric
        WHEN 'restar' THEN e.cantidad - sqlc.arg(cantidad)::numeric
        ELSE sqlc.arg(cantidad)::numeric
    END AS calculo
) AS c
WHERE e.negocio_id = sqlc.arg(negocio_id) AND e.elemento_id = sqlc.arg(elemento_id)
FOR UPDATE OF e;

-- name: ActualizarFechaOperacion :exec
UPDATE operaciones_inventario
SET registrada_en = clock_timestamp()
WHERE negocio_id = sqlc.arg(negocio_id) AND id = sqlc.arg(operacion_id);

-- name: InsertarLineaMovimiento :exec
INSERT INTO lineas_movimiento (negocio_id, operacion_id, elemento_id, unidad_id, saldo_anterior, saldo_resultante)
VALUES (sqlc.arg(negocio_id), sqlc.arg(operacion_id), sqlc.arg(elemento_id), sqlc.arg(unidad_id),
        sqlc.arg(saldo_anterior), sqlc.arg(saldo_resultante));

-- name: ActualizarSaldo :exec
UPDATE existencias_inventario AS e
SET cantidad = sqlc.arg(cantidad), actualizada_en = o.registrada_en, version = o.id
FROM operaciones_inventario AS o
WHERE e.negocio_id = sqlc.arg(negocio_id) AND e.elemento_id = sqlc.arg(elemento_id)
  AND o.negocio_id = e.negocio_id AND o.id = sqlc.arg(operacion_id);

-- +goose Up
ALTER TABLE operaciones_inventario DROP CONSTRAINT operaciones_inventario_tipo_check;
ALTER TABLE operaciones_inventario ADD CONSTRAINT operaciones_inventario_tipo_check
    CHECK (tipo IN ('apertura', 'compra', 'tanda', 'salida', 'consumo', 'merma', 'ajuste'));

CREATE TABLE movimientos_inventario (
    negocio_id uuid NOT NULL,
    operacion_id uuid NOT NULL,
    solicitud jsonb NOT NULL,
    motivo text,
    observacion text,
    PRIMARY KEY (negocio_id, operacion_id),
    FOREIGN KEY (negocio_id, operacion_id) REFERENCES operaciones_inventario (negocio_id, id)
);

CREATE TABLE lineas_movimiento (
    negocio_id uuid NOT NULL,
    operacion_id uuid NOT NULL,
    elemento_id uuid NOT NULL,
    unidad_id uuid NOT NULL,
    saldo_anterior numeric NOT NULL CHECK (saldo_anterior >= 0 AND saldo_anterior < 1000000000000 AND scale(saldo_anterior) <= 6),
    saldo_resultante numeric NOT NULL CHECK (saldo_resultante >= 0 AND saldo_resultante < 1000000000000 AND scale(saldo_resultante) <= 6),
    variacion numeric GENERATED ALWAYS AS (saldo_resultante - saldo_anterior) STORED,
    PRIMARY KEY (negocio_id, operacion_id, elemento_id),
    FOREIGN KEY (negocio_id, operacion_id) REFERENCES movimientos_inventario (negocio_id, operacion_id),
    FOREIGN KEY (negocio_id, elemento_id, unidad_id) REFERENCES elementos_inventario (negocio_id, id, unidad_id)
);

-- +goose Down
DROP TABLE lineas_movimiento;
DROP TABLE movimientos_inventario;
-- La reversión se rechaza si existen movimientos: no elimina su trazabilidad.
ALTER TABLE operaciones_inventario DROP CONSTRAINT operaciones_inventario_tipo_check;
ALTER TABLE operaciones_inventario ADD CONSTRAINT operaciones_inventario_tipo_check CHECK (tipo = 'apertura');

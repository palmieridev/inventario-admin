-- +goose Up
CREATE TABLE negocios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre text NOT NULL CHECK (nombre = btrim(nombre) AND char_length(nombre) BETWEEN 1 AND 120)
);

CREATE TABLE usuarios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    negocio_id uuid NOT NULL REFERENCES negocios (id),
    nombre text NOT NULL CHECK (nombre = btrim(nombre) AND char_length(nombre) BETWEEN 1 AND 120),
    rol text NOT NULL CHECK (rol IN ('admin', 'staff')),
    activo boolean NOT NULL DEFAULT true,
    UNIQUE (negocio_id, id)
);

CREATE TABLE jornadas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    negocio_id uuid NOT NULL REFERENCES negocios (id),
    iniciada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cerrada_en timestamptz CHECK (cerrada_en >= iniciada_en),
    UNIQUE (negocio_id, id)
);

CREATE TABLE unidades_medida (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    negocio_id uuid NOT NULL REFERENCES negocios (id),
    nombre text NOT NULL CHECK (nombre = btrim(nombre) AND char_length(nombre) BETWEEN 1 AND 60),
    simbolo text NOT NULL CHECK (simbolo = btrim(simbolo) AND char_length(simbolo) BETWEEN 1 AND 12),
    decimales smallint NOT NULL CHECK (decimales BETWEEN 0 AND 6),
    UNIQUE (negocio_id, id)
);

CREATE UNIQUE INDEX unidades_medida_nombre_unico
    ON unidades_medida (negocio_id, lower(nombre));

CREATE TABLE elementos_inventario (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    negocio_id uuid NOT NULL REFERENCES negocios (id),
    unidad_id uuid NOT NULL,
    categoria text NOT NULL CHECK (categoria IN ('insumo', 'preparado', 'bebida', 'empaque')),
    nombre text NOT NULL CHECK (nombre = btrim(nombre) AND char_length(nombre) BETWEEN 1 AND 120),
    variante text CHECK (variante = btrim(variante) AND char_length(variante) BETWEEN 1 AND 80),
    activo boolean NOT NULL DEFAULT true,
    UNIQUE (negocio_id, id),
    UNIQUE (negocio_id, id, unidad_id),
    FOREIGN KEY (negocio_id, unidad_id) REFERENCES unidades_medida (negocio_id, id)
);

CREATE UNIQUE INDEX elementos_inventario_variante_unica
    ON elementos_inventario (negocio_id, categoria, lower(nombre), lower(coalesce(variante, '')));

CREATE TABLE operaciones_inventario (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    negocio_id uuid NOT NULL REFERENCES negocios (id),
    autor_id uuid NOT NULL,
    jornada_id uuid NOT NULL,
    tipo text NOT NULL CHECK (tipo = 'apertura'),
    clave_reintento uuid NOT NULL,
    registrada_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (negocio_id, id),
    UNIQUE (negocio_id, clave_reintento),
    FOREIGN KEY (negocio_id, autor_id) REFERENCES usuarios (negocio_id, id),
    FOREIGN KEY (negocio_id, jornada_id) REFERENCES jornadas (negocio_id, id)
);

CREATE TABLE aperturas_inventario (
    negocio_id uuid NOT NULL,
    elemento_id uuid NOT NULL,
    unidad_id uuid NOT NULL,
    operacion_id uuid NOT NULL,
    cantidad numeric NOT NULL CHECK (cantidad >= 0 AND cantidad < 1000000000000 AND scale(cantidad) <= 6),
    PRIMARY KEY (negocio_id, elemento_id),
    UNIQUE (negocio_id, operacion_id),
    FOREIGN KEY (negocio_id, elemento_id, unidad_id)
        REFERENCES elementos_inventario (negocio_id, id, unidad_id),
    FOREIGN KEY (negocio_id, operacion_id) REFERENCES operaciones_inventario (negocio_id, id)
);

CREATE TABLE existencias_inventario (
    negocio_id uuid NOT NULL,
    elemento_id uuid NOT NULL,
    cantidad numeric NOT NULL CHECK (cantidad >= 0 AND cantidad < 1000000000000 AND scale(cantidad) <= 6),
    actualizada_en timestamptz NOT NULL,
    PRIMARY KEY (negocio_id, elemento_id),
    FOREIGN KEY (negocio_id, elemento_id) REFERENCES aperturas_inventario (negocio_id, elemento_id)
);

-- +goose Down
DROP TABLE existencias_inventario;
DROP TABLE aperturas_inventario;
DROP TABLE operaciones_inventario;
DROP TABLE elementos_inventario;
DROP TABLE unidades_medida;
DROP TABLE jornadas;
DROP TABLE usuarios;
DROP TABLE negocios;

# Inventario Admin

Prototipo web orientado al uso móvil para la gestión de inventarios en microempresas de comercio informal de alimentos de las calles aledañas a la UPIICSA, Iztacalco, Ciudad de México.

El proyecto busca apoyar el registro de existencias durante la preparación y la atención del puesto. La consulta pública será una salida limitada del inventario: cada negocio podrá autorizar la publicación de su oferta, disponibilidad y datos básicos de atención.

## Estado del proyecto

El repositorio se encuentra en su etapa inicial. Todavía no contiene una aplicación ejecutable ni comandos de instalación o desarrollo. Las funciones y la arquitectura descritas a continuación corresponden al alcance propuesto y se implementarán por incrementos.

## Alcance previsto

- Administrar insumos, productos preparados, bebidas y empaques, con variantes y unidades de control independientes.
- Establecer existencias mediante un conteo inicial, sin duplicar sobrantes de jornadas anteriores.
- Registrar entradas por compra, producción por tandas, salidas agrupadas, consumos y mermas con su motivo.
- Registrar correcciones autorizadas que conserven el movimiento original, el saldo anterior, el ajuste, el motivo y la autoría.
- Consultar existencias y movimientos por jornada, elemento, tipo y persona que registra.
- Confirmar la disponibilidad de cada producto o variante como disponible, agotado o no ofrecido.
- Autorizar y retirar la publicación de información para consulta sin cuenta.

Las relaciones entre componentes y porciones, los avisos de existencias bajas y los recordatorios de revisión de jornada son funciones complementarias pendientes de priorización.

## Roles

| Rol | Funciones previstas |
| --- | --- |
| Persona responsable | Administra catálogo y accesos, realiza tareas operativas, autoriza correcciones y decide qué información se publica. |
| Personal operativo autorizado | Registra movimientos, consulta existencias e historial operativo y confirma disponibilidad dentro de su negocio. |
| Cliente | Consulta sin cuenta únicamente la oferta, la disponibilidad y los datos de atención autorizados. |

## Reglas principales

- Cada registro interno pertenece a un negocio; el acceso depende del rol y de esa pertenencia.
- Cada elemento o variante conserva una unidad de control definida; no se mezclan unidades sin una equivalencia explícita.
- Una tanda reúne los insumos consumidos y los productos obtenidos en una sola operación. La salida posterior de las piezas preparadas no vuelve a descontar esos ingredientes.
- Una salida superior al saldo requiere revisar la cantidad o corregir la existencia; no genera un saldo negativo silencioso.
- La existencia registrada y la disponibilidad se distinguen. Una reposición no revierte automáticamente un agotamiento confirmado manualmente.
- La interfaz distinguirá los cambios confirmados de los intentos pendientes o fallidos. Los reintentos no deben duplicar movimientos.
- La respuesta pública excluye cantidades internas, movimientos, mermas y datos personales no autorizados, e identifica la última actualización confirmada.

## Arquitectura propuesta

Se prevé un monorepositorio con espacios de trabajo de pnpm y tres responsabilidades:

| Componente | Tecnología prevista | Responsabilidad |
| --- | --- | --- |
| Frontend | Astro y TypeScript | Formularios y consultas adaptables al teléfono. |
| Backend | TypeScript | Validación, permisos por negocio, reglas de inventario y publicación autorizada. |
| Contratos compartidos | TypeScript | Tipos de solicitudes y respuestas entre frontend y backend. |
| Persistencia | PostgreSQL | Existencias, movimientos, autoría, autorizaciones y transacciones. |

La estructura de paquetes y los comandos se documentarán conforme se incorporen al repositorio. La operación sin conexión y el uso simultáneo de varios dispositivos permanecen pendientes de validación.

## Límites

Quedan fuera cobros, pedidos, compras en línea, facturación, contabilidad, gestión fiscal, reparto y predicción automática de demanda. Los precios públicos, si se autorizan, serán informativos.

El prototipo no determinará la inocuidad de los alimentos ni implicará una certificación normativa. La reducción de mermas, la exactitud del inventario y la utilidad durante la jornada deberán evaluarse; no se consideran beneficios comprobados.

## Diseño y evaluación

El diseño de referencia se mantiene en la carpeta `design/` del espacio de trabajo académico, fuera de este repositorio. Los capítulos I–IV documentan el contexto, los requisitos y los procesos propuestos; este repositorio reunirá la implementación y su documentación técnica.

La evaluación prevista contempla tareas de consulta de existencias, registro de movimientos, confirmación de disponibilidad y separación entre información interna y pública. Se utilizarán datos ficticios para el desarrollo; las pruebas con negocios y la publicación de sus datos requerirán las autorizaciones correspondientes.

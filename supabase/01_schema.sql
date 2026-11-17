-- ============================================================
-- Dashboard de criminalidad en México (nivel estado + municipio)
-- Ejecutar en Supabase: SQL Editor > New query > pegar > Run
-- ============================================================

-- Datos del SESNSP agregados a nivel (año, municipio, tipo de delito).
-- Una fila por combinación, con una columna por mes (formato "ancho",
-- igual al CSV original) y un total anual calculado.
create table if not exists public.crimes_municipal (
  id          bigint generated always as identity primary key,
  anio        smallint not null,
  cve_ent     smallint not null,
  entidad     text     not null,
  cve_mun     integer  not null,          -- clave INEGI del municipio (ej. 14039)
  municipio   text     not null,
  tipo_delito text     not null,
  m01 integer not null default 0,
  m02 integer not null default 0,
  m03 integer not null default 0,
  m04 integer not null default 0,
  m05 integer not null default 0,
  m06 integer not null default 0,
  m07 integer not null default 0,
  m08 integer not null default 0,
  m09 integer not null default 0,
  m10 integer not null default 0,
  m11 integer not null default 0,
  m12 integer not null default 0,
  total integer generated always as
    (m01 + m02 + m03 + m04 + m05 + m06 + m07 + m08 + m09 + m10 + m11 + m12) stored,
  unique (anio, cve_mun, tipo_delito)
);

create index if not exists crimes_municipal_anio_entidad_idx
  on public.crimes_municipal (anio, entidad);
create index if not exists crimes_municipal_anio_tipo_idx
  on public.crimes_municipal (anio, tipo_delito);
create index if not exists crimes_municipal_entidad_mun_idx
  on public.crimes_municipal (entidad, cve_mun);

-- Población (opcional, para la tasa por 100,000 habitantes).
-- Si la tabla está vacía el dashboard funciona igual y muestra
-- "Sin datos de población" en la tasa.
create table if not exists public.poblacion_estatal (
  entidad   text     not null,
  anio      smallint not null,
  poblacion bigint   not null check (poblacion > 0),
  primary key (entidad, anio)
);

-- Seguridad: las tablas NO son legibles directamente desde la API pública.
-- El frontend solo puede llamar a las funciones RPC de 02_functions.sql.
alter table public.crimes_municipal  enable row level security;
alter table public.poblacion_estatal enable row level security;

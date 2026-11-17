#!/usr/bin/env python3
"""
Carga el CSV limpio (salida de prepare_data.py) en la tabla crimes_municipal de
Supabase usando COPY, que es mucho más rápido y robusto que el import del navegador.

Requisitos (una sola vez):
  pip install "psycopg[binary]"

Uso:
  python scripts/load_to_supabase.py crimes_municipal.csv
  python scripts/load_to_supabase.py crimes_municipal.csv --truncate   # vacía la tabla antes
  python scripts/load_to_supabase.py crimes_municipal.csv --insert     # plan B: INSERT por lotes

La cadena de conexión se pide por teclado (no se muestra ni se guarda), o se toma de la
variable de entorno DATABASE_URL. En Supabase: botón "Connect" -> "Session pooler"
-> copia la URI y reemplaza [YOUR-PASSWORD] por la contraseña de tu base de datos.
"""
import argparse
import csv
import getpass
import os
import sys

try:
    import psycopg
except ImportError:
    sys.exit('Falta psycopg. Instálalo con:  pip install "psycopg[binary]"')

COLUMNAS = ("anio, cve_ent, entidad, cve_mun, municipio, tipo_delito, "
            "m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12")


def cargar_con_copy(cur, ruta):
    copiadas = 0
    with open(ruta, "r", encoding="utf-8", newline="") as f:
        with cur.copy(f"copy public.crimes_municipal ({COLUMNAS}) from stdin with (format csv, header true)") as copy:
            while True:
                bloque = f.read(1024 * 1024)
                if not bloque:
                    break
                copy.write(bloque)
                copiadas += bloque.count("\n")
                print(f"\rEnviando... ~{copiadas:,} filas", end="", flush=True)
    print()


def cargar_con_insert(cur, ruta, lote=2000):
    marcas = ", ".join(["%s"] * 18)
    sql = f"insert into public.crimes_municipal ({COLUMNAS}) values ({marcas})"
    enviadas = 0
    buffer = []
    with open(ruta, "r", encoding="utf-8", newline="") as f:
        lector = csv.reader(f)
        next(lector)  # encabezado
        for fila in lector:
            buffer.append((int(fila[0]), int(fila[1]), fila[2], int(fila[3]), fila[4], fila[5],
                           *[int(x) for x in fila[6:18]]))
            if len(buffer) >= lote:
                cur.executemany(sql, buffer)
                enviadas += len(buffer)
                buffer = []
                print(f"\rEnviando... {enviadas:,} filas", end="", flush=True)
        if buffer:
            cur.executemany(sql, buffer)
            enviadas += len(buffer)
    print(f"\rEnviando... {enviadas:,} filas")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv")
    ap.add_argument("--truncate", action="store_true", help="vaciar la tabla antes de cargar")
    ap.add_argument("--insert", action="store_true",
                    help="plan B: usa INSERT por lotes en vez de COPY (más lento, pero a prueba de fallas)")
    args = ap.parse_args()

    if not os.path.isfile(args.csv):
        sys.exit(f"No encuentro el archivo: {args.csv}")

    url = os.environ.get("DATABASE_URL") or getpass.getpass("Pega tu cadena de conexión (no se verá al escribir): ").strip()
    if not url.startswith(("postgresql://", "postgres://")):
        sys.exit("La cadena debe empezar con postgresql://  (Supabase -> Connect -> Session pooler).")
    if "[YOUR-PASSWORD]" in url:
        sys.exit("Falta reemplazar [YOUR-PASSWORD] por la contraseña de tu base de datos.")

    try:
        conn = psycopg.connect(url, connect_timeout=20)
    except psycopg.OperationalError as e:
        sys.exit(f"No pude conectar: {e}\nRevisa la contraseña y usa la URI de 'Session pooler'.")

    with conn:
        with conn.cursor() as cur:
            if args.truncate:
                cur.execute("truncate table public.crimes_municipal restart identity")
                print("Tabla vaciada.")
            else:
                cur.execute("select count(*) from public.crimes_municipal")
                existentes = cur.fetchone()[0]
                if existentes:
                    sys.exit(f"La tabla ya tiene {existentes:,} filas. Usa --truncate para reemplazarlas.")

            if args.insert:
                cargar_con_insert(cur, args.csv)
            else:
                cargar_con_copy(cur, args.csv)

            cur.execute("select count(*), min(anio), max(anio), count(distinct cve_mun), count(distinct entidad) "
                        "from public.crimes_municipal")
            n, a0, a1, muns, ents = cur.fetchone()
    print(f"Listo: {n:,} filas | años {a0}-{a1} | {ents} estados | {muns:,} municipios")


if __name__ == "__main__":
    main()
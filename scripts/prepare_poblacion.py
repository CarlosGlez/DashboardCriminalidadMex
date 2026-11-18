#!/usr/bin/env python3
"""
Genera el CSV para la tabla `poblacion_estatal` (entidad, anio, poblacion) a partir de
las proyecciones de población de CONAPO 2020-2070 (población a MITAD de año, 1 de julio).

Fuente oficial (datos abiertos de CONAPO):
  https://conapo.segob.gob.mx/work/models/CONAPO/Datos_Abiertos/pry23/00_Pob_Mitad_1950_2070.csv
Columnas del archivo: RENGLON, AÑO, ENTIDAD, CVE_GEO, EDAD, SEXO, POBLACION
(una fila por año, entidad, edad y sexo; CVE_GEO = 0 es el total nacional).

Qué hace:
  - Suma POBLACION de todas las edades y sexos -> una fila por (entidad, año).
  - Descarta el total nacional (CVE_GEO = 0).
  - Pone el nombre de entidad EXACTO que usa crimes_municipal. Para eso cruza por la
    clave INEGI (CVE_GEO de CONAPO = cve_ent de crimes_municipal) con un CSV de
    referencia que sacas de tu base (ver --entidades).
  - Verifica que haya 32 estados en cada año y que la suma coincida con el total nacional.

Paso previo: exporta la lista de entidades desde el SQL Editor de Supabase
  select distinct cve_ent, entidad from public.crimes_municipal order by cve_ent;
y descarga el resultado como CSV (botón "Download CSV"), p. ej. entidades.csv.

Uso (ENTRADA puede ser un .csv local o el ENLACE de descarga):
  python scripts/prepare_poblacion.py \\
      https://conapo.segob.gob.mx/work/models/CONAPO/Datos_Abiertos/pry23/00_Pob_Mitad_1950_2070.csv \\
      poblacion_estatal.csv --entidades entidades.csv --desde 2015 --hasta 2025
  python scripts/prepare_poblacion.py 00_Pob_Mitad_1950_2070.csv poblacion_estatal.csv \\
      --entidades entidades.csv --sql poblacion_estatal.sql

Salida: CSV con encabezado entidad,anio,poblacion (y, con --sql, un archivo con INSERTs
listo para pegar en el SQL Editor).
"""
import argparse
import csv
import os
import shutil
import sys
import tempfile
import unicodedata
import urllib.request

URL_OFICIAL = "https://conapo.segob.gob.mx/work/models/CONAPO/Datos_Abiertos/pry23/00_Pob_Mitad_1950_2070.csv"


def norm(texto: str) -> str:
    """'AÑO' -> 'ano', 'Cve. Ent' -> 'cveent'."""
    t = unicodedata.normalize("NFKD", texto)
    t = "".join(c for c in t if not unicodedata.combining(c))
    return "".join(c for c in t.lower() if c.isalnum())


def descargar(url: str, carpeta: str) -> str:
    destino = os.path.join(carpeta, "entrada.csv")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as r, open(destino, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        bajado = 0
        while True:
            bloque = r.read(1024 * 1024)
            if not bloque:
                break
            f.write(bloque)
            bajado += len(bloque)
            meta = f" / {total / 1e6:,.0f}" if total else ""
            print(f"\rDescargando... {bajado / 1e6:,.0f}{meta} MB", end="", flush=True)
    print()
    return destino


def abrir(ruta: str):
    for enc in ("utf-8-sig", "latin-1"):
        try:
            with open(ruta, encoding=enc) as f:
                f.read(1_000_000)
            return open(ruta, encoding=enc, newline="")
        except UnicodeDecodeError:
            continue
    sys.exit("No se pudo leer el archivo: codificación desconocida.")


def columna(indice: dict, variantes: list, archivo: str, cabecera: list) -> int:
    for v in variantes:
        if v in indice:
            return indice[v]
    sys.exit(f"No encontré ninguna de {variantes} en {archivo}.\n"
             f"Columnas: {', '.join(cabecera)}")


def leer_entidades(ruta: str) -> dict:
    """CSV de referencia (cve_ent, entidad) -> {cve_ent: entidad}."""
    with abrir(ruta) as f:
        lector = csv.reader(f)
        cab = next(lector, None)
        if not cab:
            sys.exit(f"{ruta} está vacío.")
        idx = {norm(c): i for i, c in enumerate(cab)}
        i_cve = columna(idx, ["cveent", "claveent", "cvegeo", "cveentidad"], ruta, cab)
        i_ent = columna(idx, ["entidad"], ruta, cab)
        ref = {}
        for fila in lector:
            if not fila or not fila[i_cve].strip():
                continue
            cve, nombre = int(float(fila[i_cve])), fila[i_ent].strip()
            if cve in ref and ref[cve] != nombre:
                sys.exit(f"La clave {cve} aparece con dos nombres: '{ref[cve]}' y '{nombre}'.")
            ref[cve] = nombre
    faltan = sorted(set(range(1, 33)) - set(ref))
    if faltan:
        sys.exit(f"{ruta} no trae todas las claves 1-32. Faltan: {faltan}")
    extra = sorted(set(ref) - set(range(1, 33)))
    if extra:
        sys.exit(f"{ruta} trae claves fuera de 1-32: {extra}")
    return ref


def sql_texto(valor: str) -> str:
    return "'" + valor.replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("entrada", help="CSV de CONAPO (00_Pob_Mitad_1950_2070.csv) o su enlace")
    ap.add_argument("salida", help="CSV de salida (entidad,anio,poblacion)")
    ap.add_argument("--entidades", required=True,
                    help="CSV con cve_ent,entidad sacado de crimes_municipal (nombres exactos)")
    ap.add_argument("--desde", type=int, default=2015)
    ap.add_argument("--hasta", type=int, default=2025)
    ap.add_argument("--sql", default=None, help="además, escribe INSERTs ... ON CONFLICT para el SQL Editor")
    args = ap.parse_args()

    ref = leer_entidades(args.entidades)

    carpeta = tempfile.mkdtemp(prefix="conapo_")
    try:
        if args.entrada.lower().startswith(("http://", "https://")):
            ruta = descargar(args.entrada, carpeta)
        else:
            if not os.path.isfile(args.entrada):
                sys.exit(f"No encuentro el archivo: {args.entrada}")
            ruta = args.entrada
        pob, nacional, nombres_conapo = sumar(ruta, args)
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)

    anios = list(range(args.desde, args.hasta + 1))
    errores = []
    for a in anios:
        cves = {c for (aa, c) in pob if aa == a}
        if cves != set(range(1, 33)):
            errores.append(f"{a}: estados encontrados {len(cves)}, esperaba 32 (faltan {sorted(set(range(1, 33)) - cves)})")
    if errores:
        sys.exit("Datos incompletos en el archivo de CONAPO:\n  " + "\n  ".join(errores))

    # Control: suma de estados vs total nacional (CVE_GEO = 0)
    for a in anios:
        suma = sum(v for (aa, c), v in pob.items() if aa == a)
        nac = nacional.get(a)
        if nac and abs(suma - nac) / nac > 0.001:
            print(f"AVISO {a}: suma de estados {suma:,} vs nacional {nac:,}", file=sys.stderr)

    filas = [(ref[c], a, round(pob[(a, c)])) for a in anios for c in range(1, 33)]
    filas.sort(key=lambda r: (r[0], r[1]))

    with open(args.salida, "w", encoding="utf-8", newline="") as out:
        w = csv.writer(out)
        w.writerow(["entidad", "anio", "poblacion"])
        w.writerows(filas)

    if args.sql:
        with open(args.sql, "w", encoding="utf-8", newline="\n") as out:
            out.write("-- Generado por scripts/prepare_poblacion.py (CONAPO, población a mitad de año)\n")
            out.write("insert into public.poblacion_estatal (entidad, anio, poblacion) values\n")
            out.write(",\n".join(f"  ({sql_texto(e)}, {a}, {p})" for e, a, p in filas))
            out.write("\non conflict (entidad, anio) do update set poblacion = excluded.poblacion;\n")

    print("Nombres: CONAPO -> crimes_municipal (revisa que sean el mismo estado)")
    for c in range(1, 33):
        marca = "" if nombres_conapo.get(c) == ref[c] else "   <- distinto texto, se usa el de crimes_municipal"
        print(f"  {c:02d}  {nombres_conapo.get(c)!s:32} -> {ref[c]}{marca}")
    print(f"Filas: {len(filas)} ({len(anios)} años x 32 estados) | años {anios[0]}-{anios[-1]}")
    print(f"Archivo listo: {args.salida}" + (f"  |  SQL: {args.sql}" if args.sql else ""))


def sumar(ruta: str, args):
    pob = {}          # (anio, cve) -> población total (todas las edades y sexos)
    nacional = {}     # anio -> total nacional (CVE_GEO = 0), solo para verificar
    nombres = {}      # cve -> nombre que usa CONAPO
    with abrir(ruta) as f:
        lector = csv.reader(f)
        cab = next(lector, None)
        if not cab:
            sys.exit("El archivo está vacío.")
        idx = {norm(c): i for i, c in enumerate(cab)}
        i_anio = columna(idx, ["ano", "anio", "year"], "el archivo de CONAPO", cab)
        i_ent = columna(idx, ["entidad"], "el archivo de CONAPO", cab)
        i_cve = columna(idx, ["cvegeo", "cveent", "claveent"], "el archivo de CONAPO", cab)
        i_pob = columna(idx, ["poblacion"], "el archivo de CONAPO", cab)
        for fila in lector:
            if not fila:
                continue
            anio = int(float(fila[i_anio]))
            if anio < args.desde or anio > args.hasta:
                continue
            cve = int(float(fila[i_cve]))
            valor = float(fila[i_pob] or 0)
            if cve == 0:
                nacional[anio] = nacional.get(anio, 0) + valor
                continue
            pob[(anio, cve)] = pob.get((anio, cve), 0) + valor
            nombres.setdefault(cve, fila[i_ent].strip())
    return pob, nacional, nombres


if __name__ == "__main__":
    main()

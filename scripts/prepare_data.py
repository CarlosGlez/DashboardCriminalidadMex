#!/usr/bin/env python3
"""
Limpia el CSV MUNICIPAL de incidencia delictiva del SESNSP (nueva metodología)
y genera un CSV listo para importar en la tabla `crimes_municipal` de Supabase.

Qué hace:
  - Detecta la codificación (UTF-8 o Latin-1) y las columnas por nombre,
    ignorando acentos, mayúsculas y signos.
  - Suma subtipo y modalidad, dejando una fila por (año, municipio, tipo de delito).
    Esto reduce el archivo a una fracción y cabe en el plan gratuito de Supabase.
  - Genera las columnas m01..m12 (una por mes).

Uso (ENTRADA puede ser un .csv, un .zip o el ENLACE de descarga):
  python prepare_data.py ARCHIVO_SESNSP.csv salida_crimes_municipal.csv
  python prepare_data.py ARCHIVO_SESNSP.zip salida.csv --desde 2015 --hasta 2025
  python prepare_data.py "https://.../archivo.csv" salida.csv --desde 2015 --hasta 2025

Con un enlace, el script descarga el archivo a una carpeta temporal, lo procesa
y lo borra al terminar; solo queda el CSV limpio (mucho más pequeño).
"""
import argparse
import csv
import os
import shutil
import sys
import tempfile
import unicodedata
import urllib.request
import zipfile

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

# Nombre normalizado de columna -> posibles variantes en el CSV
CAMPOS = {
    "anio":        ["ano", "anio", "year"],
    "cve_ent":     ["claveent", "cveent", "cveentidad", "claveentidad"],
    "entidad":     ["entidad"],
    "cve_mun":     ["cvemunicipio", "clavemunicipio", "cvemun", "clavemun"],
    "municipio":   ["municipio"],
    "tipo_delito": ["tipodedelito", "tipodelito"],
}


def norm(texto: str) -> str:
    """'Cve. Municipio' -> 'cvemunicipio', 'Año' -> 'ano'."""
    t = unicodedata.normalize("NFKD", texto)
    t = "".join(c for c in t if not unicodedata.combining(c))
    return "".join(c for c in t.lower() if c.isalnum())


def descargar(url: str, carpeta: str) -> str:
    """Descarga por partes (sin cargar todo en memoria) mostrando el avance."""
    destino = os.path.join(carpeta, os.path.basename(url.split("?")[0]) or "descarga.csv")
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
            if total:
                print(f"\rDescargando... {bajado / 1e6:,.0f} / {total / 1e6:,.0f} MB", end="", flush=True)
            else:
                print(f"\rDescargando... {bajado / 1e6:,.0f} MB", end="", flush=True)
    print()
    return destino


def resolver_entrada(entrada: str, carpeta: str) -> str:
    """Devuelve la ruta de un .csv local a partir de un enlace, un .zip o un .csv."""
    ruta = descargar(entrada, carpeta) if entrada.lower().startswith(("http://", "https://")) else entrada
    if zipfile.is_zipfile(ruta):
        with zipfile.ZipFile(ruta) as z:
            csvs = [i for i in z.infolist() if i.filename.lower().endswith(".csv")]
            if not csvs:
                sys.exit("El .zip no contiene ningún .csv.")
            grande = max(csvs, key=lambda i: i.file_size)
            print(f"Descomprimiendo {grande.filename}...")
            destino = os.path.join(carpeta, "entrada.csv")
            with z.open(grande) as src, open(destino, "wb") as dst:
                shutil.copyfileobj(src, dst)
            return destino
    return ruta


def abrir(ruta: str):
    """Abre el CSV probando UTF-8 (con BOM) y luego Latin-1."""
    for enc in ("utf-8-sig", "latin-1"):
        try:
            with open(ruta, encoding=enc) as f:
                f.read(1_000_000)  # prueba rápida de decodificación
            return open(ruta, encoding=enc, newline="")
        except UnicodeDecodeError:
            continue
    sys.exit("No se pudo leer el archivo: codificación desconocida.")


def entero(valor: str) -> int:
    valor = (valor or "").strip().replace(",", "")
    if not valor:
        return 0
    try:
        return int(float(valor))
    except ValueError:
        return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("entrada")
    ap.add_argument("salida")
    ap.add_argument("--desde", type=int, default=None, help="año inicial (opcional)")
    ap.add_argument("--hasta", type=int, default=None, help="año final (opcional)")
    args = ap.parse_args()

    carpeta = tempfile.mkdtemp(prefix="sesnsp_")
    try:
        ruta_csv = resolver_entrada(args.entrada, carpeta)
        procesar(ruta_csv, args)
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)


def procesar(ruta_csv, args):
    with abrir(ruta_csv) as f:
        lector = csv.reader(f)
        try:
            cabecera = next(lector)
        except StopIteration:
            sys.exit("El archivo está vacío.")
        indice = {norm(c): i for i, c in enumerate(cabecera)}

        cols = {}
        faltan = []
        for campo, variantes in CAMPOS.items():
            hallada = next((indice[v] for v in variantes if v in indice), None)
            if hallada is None:
                faltan.append(campo)
            cols[campo] = hallada
        meses = [indice.get(m) for m in MESES]
        faltan += [MESES[i] for i, m in enumerate(meses) if m is None]
        if faltan:
            sys.exit(
                "No encontré estas columnas: " + ", ".join(faltan) + "\n"
                "Columnas del archivo: " + ", ".join(cabecera) + "\n"
                "¿Es el archivo MUNICIPAL con la nueva metodología? "
                "(el estatal no trae municipio)."
            )

        acumulado = {}
        leidas = 0
        for fila in lector:
            if not fila:
                continue
            leidas += 1
            anio = entero(fila[cols["anio"]])
            if (args.desde and anio < args.desde) or (args.hasta and anio > args.hasta):
                continue
            clave = (
                anio,
                entero(fila[cols["cve_ent"]]),
                fila[cols["entidad"]].strip(),
                entero(fila[cols["cve_mun"]]),
                fila[cols["municipio"]].strip(),
                fila[cols["tipo_delito"]].strip(),
            )
            valores = acumulado.get(clave)
            if valores is None:
                valores = acumulado[clave] = [0] * 12
            for i, col in enumerate(meses):
                valores[i] += entero(fila[col])

    columnas = ["anio", "cve_ent", "entidad", "cve_mun", "municipio", "tipo_delito"] + \
               [f"m{i:02d}" for i in range(1, 13)]
    with open(args.salida, "w", encoding="utf-8", newline="") as out:
        w = csv.writer(out)
        w.writerow(columnas)
        for clave in sorted(acumulado):
            w.writerow(list(clave) + acumulado[clave])

    anios = sorted({k[0] for k in acumulado})
    print(f"Filas leídas: {leidas:,}  ->  filas de salida: {len(acumulado):,}")
    if anios:
        print(f"Años: {anios[0]}-{anios[-1]}  |  Estados: {len({k[1] for k in acumulado})}"
              f"  |  Municipios: {len({k[3] for k in acumulado}):,}"
              f"  |  Tipos de delito: {len({k[5] for k in acumulado})}")
    print(f"Archivo listo: {args.salida}")


if __name__ == "__main__":
    main()
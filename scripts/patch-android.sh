#!/usr/bin/env bash
# Ajusta el proyecto Android generado por Capacitor para:
# - No robar el foco al pulsar "Recientes"
# - No interceptar apertura de otros .apk / archivos
# - launchMode más predecible (singleTop)
set -euo pipefail

MANIFEST="android/app/src/main/AndroidManifest.xml"
MAIN_ACT="android/app/src/main/java/cu/cubapos/universal/MainActivity.java"

if [ ! -f "$MANIFEST" ]; then
  # Rutas alternativas según appId
  MANIFEST=$(find android/app/src/main -name 'AndroidManifest.xml' 2>/dev/null | head -1 || true)
fi

if [ -z "${MANIFEST:-}" ] || [ ! -f "$MANIFEST" ]; then
  echo "No se encontró AndroidManifest.xml"
  exit 0
fi

echo "Parcheando $MANIFEST"

# launchMode: singleTask a veces reabre la app de forma agresiva desde Recientes
# singleTop es más amable con el multitasking
if grep -q 'android:launchMode' "$MANIFEST"; then
  sed -i 's/android:launchMode="[^"]*"/android:launchMode="singleTop"/g' "$MANIFEST"
else
  sed -i 's/<activity /<activity android:launchMode="singleTop" /' "$MANIFEST" || true
fi

# Evitar que la actividad limpie la pila al relanzar
if grep -q 'android:clearTaskOnLaunch' "$MANIFEST"; then
  sed -i 's/android:clearTaskOnLaunch="[^"]*"/android:clearTaskOnLaunch="false"/g' "$MANIFEST"
fi

# No excluir de recientes (queremos que se comporte como app normal)
if grep -q 'android:excludeFromRecents' "$MANIFEST"; then
  sed -i 's/android:excludeFromRecents="[^"]*"/android:excludeFromRecents="false"/g' "$MANIFEST"
fi

# Quitar intent-filters peligrosos que capturen archivos/APK/http genéricos
# (solo dejamos MAIN/LAUNCHER)
python3 - <<'PY'
import re, pathlib, sys
p = pathlib.Path("android/app/src/main/AndroidManifest.xml")
if not p.exists():
    # buscar
    cands = list(pathlib.Path("android").rglob("AndroidManifest.xml"))
    if not cands:
        sys.exit(0)
    p = cands[0]
text = p.read_text(encoding="utf-8")

# Eliminar intent-filters que no sean solo MAIN+LAUNCHER
def keep_filter(block: str) -> bool:
    has_main = "android.intent.action.MAIN" in block
    has_launcher = "android.intent.category.LAUNCHER" in block
    # filtros peligrosos
    bad = [
        "android.intent.action.VIEW",
        "android.intent.action.SEND",
        "android.intent.action.SEND_MULTIPLE",
        "android.intent.action.PACKAGE_",
        "application/vnd.android.package-archive",
        "content://",
        "file://",
        "android.intent.category.BROWSABLE",
        "android.intent.category.HOME",
        "android.intent.category.DEFAULT",
    ]
    # DEFAULT solo es malo si hay VIEW
    if has_main and has_launcher and "android.intent.action.VIEW" not in block:
        return True
    for b in bad:
        if b in block and not (has_main and has_launcher and b == "android.intent.category.DEFAULT"):
            # si es SOLO launcher, DEFAULT no debería estar; si hay VIEW, fuera
            if b == "android.intent.category.DEFAULT" and has_main and has_launcher and "VIEW" not in block:
                continue
            if "VIEW" in block or "SEND" in block or "package-archive" in block or "BROWSABLE" in block or "HOME" in block:
                return False
    if has_main and has_launcher:
        return True
    # otros filtros: eliminar
    return False

pattern = re.compile(r"<intent-filter\b[\s\S]*?</intent-filter>", re.M)

def repl(m):
    block = m.group(0)
    if keep_filter(block):
        return block
    print("Eliminando intent-filter no launcher:")
    print(block[:200])
    return ""

new_text, n = pattern.subn(repl, text)
if n:
    p.write_text(new_text, encoding="utf-8")
    print(f"Procesados {n} intent-filters")
else:
    print("Sin cambios en intent-filters")
PY

echo "Manifest tras parche (activity):"
grep -n "activity\|launchMode\|intent-filter\|MAIN\|LAUNCHER\|VIEW\|package-archive" "$MANIFEST" || true

echo "OK patch-android"

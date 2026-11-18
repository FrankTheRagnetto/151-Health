#!/usr/bin/env python3
"""esercizi.py — il catalogo di «My workouts».

Fonte: https://github.com/yuhonas/free-exercise-db (Unlicense, dominio pubblico):
dist/exercises.json + exercises/<id>/0.jpg e 1.jpg (posizione A e B).

Produce, dentro www/ (quindi dentro l'APK, senza rete):
  www/esercizi/catalogo.json   [{id, name, primaryMuscles, secondaryMuscles, equipment,
                                 category, level, instructions, img:[a, b]}]
  www/esercizi/img/<id>-0.webp, <id>-1.webp   lato lungo 480 px, WebP qualità 70
  www/esercizi/LICENSE          l'Unlicense e la fonte (commit compreso)

Gli esercizi senza le due foto restano fuori (il catalogo promette due foto a testa).
Ogni file si scrive accanto col PID nel nome e poi si rinomina: un giro interrotto
non lascia mai un file troncato col nome buono.

Uso:  python3 tools/esercizi.py [cartella-della-fonte]
      (di base /tmp/free-exercise-db; se non c'è, la clona: git clone --depth 1)
"""
import io
import json
import os
import shutil
import subprocess
import sys

from PIL import Image

REPO = 'https://github.com/yuhonas/free-exercise-db'
QUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(QUI, 'www', 'esercizi')
IMG = os.path.join(OUT, 'img')
LATO = 480
QUALITA = 70

def scrivi(path, data):
    tmp = path + '.%d.part' % os.getpid()
    with open(tmp, 'wb') as f:
        f.write(data)
    os.replace(tmp, path)

def fonte(src):
    if os.path.isfile(os.path.join(src, 'dist', 'exercises.json')):
        return src
    part = src + '.part'
    shutil.rmtree(part, ignore_errors=True)
    r = subprocess.run(['git', 'clone', '--depth', '1', REPO, part])
    if r.returncode != 0 or not os.path.isfile(os.path.join(part, 'dist', 'exercises.json')):
        sys.exit('clone fallito: niente toccato')
    os.replace(part, src)
    return src

def main():
    src = fonte(sys.argv[1] if len(sys.argv) > 1 else '/tmp/free-exercise-db')
    commit = subprocess.run(['git', '-C', src, 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
    with open(os.path.join(src, 'dist', 'exercises.json'), encoding='utf-8') as f:
        tutti = json.load(f)
    os.makedirs(IMG, exist_ok=True)

    cat, fuori, vivi = [], [], set()
    for x in sorted(tutti, key=lambda e: e['name'].lower()):
        foto = x.get('images') or []
        if len(foto) != 2 or not all(os.path.isfile(os.path.join(src, 'exercises', p)) for p in foto):
            fuori.append(x['id'])
            continue
        nomi = []
        for i, p in enumerate(foto):
            nome = '%s-%d.webp' % (x['id'], i)
            im = Image.open(os.path.join(src, 'exercises', p)).convert('RGB')
            im.thumbnail((LATO, LATO), Image.LANCZOS)

            b = io.BytesIO()
            im.save(b, 'WEBP', quality=QUALITA, method=6)
            scrivi(os.path.join(IMG, nome), b.getvalue())
            nomi.append(nome)
            vivi.add(nome)
        cat.append({
            'id': x['id'], 'name': x['name'].strip(),
            'primaryMuscles': x.get('primaryMuscles') or [],
            'secondaryMuscles': x.get('secondaryMuscles') or [],
            'equipment': x.get('equipment') or 'none',
            'category': x.get('category') or '',
            'level': x.get('level') or '',
            'instructions': x.get('instructions') or [],
            'img': nomi,
        })

    # le foto di un giro vecchio che non servono più
    for n in os.listdir(IMG):
        if n not in vivi:
            os.remove(os.path.join(IMG, n))

    scrivi(os.path.join(OUT, 'catalogo.json'),
           json.dumps({'v': 1, 'fonte': REPO, 'commit': commit, 'esercizi': cat},
                      ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
    with open(os.path.join(src, 'LICENSE.md'), encoding='utf-8') as f:
        lic = f.read()
    scrivi(os.path.join(OUT, 'LICENSE'), (
        'Exercise names, instructions and photos in this folder come from\n'
        'free-exercise-db, ' + REPO + ' (commit ' + commit + ').\n'
        'Photos resized to ' + str(LATO) + ' px (WebP) for 151 Health by tools/esercizi.py.\n'
        'The source is released into the public domain under the Unlicense:\n\n' + lic).encode('utf-8'))

    tot = sum(os.path.getsize(os.path.join(IMG, n)) for n in os.listdir(IMG))
    print('esercizi: %d (fuori senza due foto: %s)' % (len(cat), ', '.join(fuori) or 'nessuno'))
    print('foto: %d file, %.1f MB' % (len(vivi), tot / 1e6))
    print('catalogo.json: %.0f kB' % (os.path.getsize(os.path.join(OUT, 'catalogo.json')) / 1e3))

if __name__ == '__main__':
    main()

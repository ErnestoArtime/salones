#!/usr/bin/env python3
"""Reload API-only environment changes on the managed VPS, without printing secrets."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import urllib.request

workspace = Path(__file__).resolve().parents[1]
marker = workspace / '.local/auto-deploy.enabled'
if not marker.is_file():
    raise SystemExit('Este comando requiere el despliegue gestionado del VPS.')
root = Path(marker.read_text().strip())
locks = []
try:
    for name in ['deploy.lock', 'backup.lock']:
        lock = (workspace / '.local' / name).open('a')
        locks.append(lock)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('Hay un despliegue o respaldo activo. Reintenta al terminar.')
    state = json.loads((root / 'state.json').read_text())
    config = json.loads((root / 'config.json').read_text())
    if 'in_progress' in state or state['status'] not in ['ready', 'deployed']:
        raise SystemExit('Primero resuelve el estado del despliegue.')
    spec = importlib.util.spec_from_file_location('lavia_deploy', '/usr/local/lib/lavia-deploy/deploy.py')
    deploy = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(deploy)
    release, tag = Path(state['release']), state['tag']
    deploy.validate_candidate(deploy.rendered(release, tag), config['approved'], tag)
    deploy.compose(release, tag, 'up', '-d', '--no-deps', '--wait', '--wait-timeout', '120', 'api')
    with urllib.request.urlopen('http://127.0.0.1:' + str(config['http_port']) + '/api/health', timeout=10) as response:
        if response.status != 200:
            raise SystemExit('La API necesita revisión.')
    print('Configuración de la API recargada. Datos y archivos conservados.')
finally:
    for lock in locks:
        lock.close()

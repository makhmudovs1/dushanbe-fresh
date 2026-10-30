import json
import os
import pathlib
import socket

os.umask(0o077)
for port in [3000, 4000, 8448, 15436]:
    with socket.socket() as test:
        test.bind(('127.0.0.1', port))
root = pathlib.Path.home() / 'df-tarena-readiness-20261031'
root.mkdir(mode=0o700)
for name in ['ops', 'tls', 'caddy-config', 'proxy-logs', 'state']:
    (root / name).mkdir(mode=0o700)
print(json.dumps({'newReadinessDirectory': True, 'portsAvailable': True, 'noSecretsCopied': True}))

"""
Compat shim.

El contenedor espera /app/catalog.py (motor/Dockerfile lo copia ahí).
La fuente de verdad está en motor/catalog.py.
"""
from motor.catalog import *  # noqa: F401,F403

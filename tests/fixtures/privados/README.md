# `tests/fixtures/privados/` — tus circuitos

Esta carpeta es para circuitos **tuyos** (de la universidad, personales, o de cualquier
sitio) que queramos usar como casos de prueba reales.

## Por qué está separada

**No se suben al repositorio.** Está excluida en `.gitignore`:

```
tests/fixtures/privados/*
!tests/fixtures/privados/README.md
```

Así podemos probar WebCircuits con circuitos que conoces de verdad —mucho mejores que
los de ejemplo— sin publicar tu trabajo.

## Cómo usarla

Copia aquí cualquier `.CircuitProject`. A partir de ahí:

- Los usaré para comprobar que WebCircuits **abre y simula bien** circuitos reales.
- Estos circuitos son los que más te importan: si uno de ellos no funciona, es un fallo
  grave y tiene prioridad.

## Estado

⬜ **Vacía.** Tus proyectos de 2024 (`Proyect Multiplicador…`, `CPU_Angel_Zeledon…`)
ya no están en este equipo. Si los recuperas de un pendrive o de la nube, déjalos aquí.

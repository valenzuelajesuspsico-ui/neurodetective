# NeuroDetective RDoC

Juego educativo de razonamiento clínico basado en el marco **RDoC** (Research Domain Criteria). Entrevista a pacientes, clasifica la evidencia en la matriz RDoC (6 dominios × 8 unidades de análisis), redacta informes y conecta los casos entre sí.

Herramienta de práctica para estudiantes y profesionales de neuropsicología. No sustituye la formación clínica supervisada; todos los casos son ficticios y de uso didáctico.

## Modos de juego

- **Curso de RDoC** — repaso de los 6 dominios y las 8 unidades de análisis con un mini-examen final.
- **Modo Juego** — 27 expedientes (clásicos, infantojuveniles, adultos y geriátricos): entrevista, clasifica en la matriz, redacta el informe y revisa el seguimiento a 6 meses.
- **Modo Supervisión** — encuentra el error oculto en el informe de un colega ficticio.
- **Modo Estudio** — 6 casos (uno por dominio) sin puntaje ni penalizaciones para navegar libremente.

## Stack

- [React](https://react.dev) 18
- [Vite](https://vite.dev)
- [Tailwind CSS](https://tailwindcss.com) 3
- [lucide-react](https://lucide.dev) (iconos)

## Desarrollo

```bash
npm install      # instalar dependencias
npm run dev      # servidor de desarrollo (http://localhost:5173)
npm run build    # build de producción en dist/
npm run preview  # previsualizar el build de producción
```

## Estructura

```
index.html                     punto de entrada HTML
src/main.jsx                   bootstrap de React
src/NeuroDetectiveRDoC.jsx     aplicación completa (componente principal)
src/index.css                  directivas de Tailwind y estilos base
```

---

Elaborado por Jesús Valenzuela.

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

npm run build:singlefile   # genera un único HTML autónomo en dist-singlefile/
npm test                   # ejecuta las pruebas (Vitest)
```

El comando `build:singlefile` empaqueta toda la app (JS + CSS) en un solo
archivo `dist-singlefile/index.html` que se abre directamente en el navegador
(doble clic, sin servidor ni conexión a internet) — útil para compartir o
probar la aplicación rápidamente.

## Estructura

```
index.html                     punto de entrada HTML
src/main.jsx                   bootstrap de React
src/NeuroDetectiveRDoC.jsx     aplicación (componente principal + pantallas)
src/logic.js                   lógica pura, testeable (informe, rangos, etc.)
src/logic.test.js              pruebas de la lógica pura (Vitest)
src/index.css                  Tailwind, estilos base y animaciones
```

## Modo Experto (opcional)

El "Modo Experto" consulta la API de Anthropic **desde el navegador**, por lo
que requiere tu propia API key, que introduces en la pantalla y se guarda solo
en `localStorage` (nunca se envía a otro sitio). Sin key, el resto del juego
funciona con normalidad.

---

Elaborado por Jesús Valenzuela.

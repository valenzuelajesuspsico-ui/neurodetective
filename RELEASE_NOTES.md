# NeuroDetective RDoC — v1.0.0

**Fecha:** 2 de julio de 2026
**App en vivo:** https://valenzuelajesuspsico-ui.github.io/neurodetective/

Juego educativo (PWA) para practicar **razonamiento clínico** con el marco
**RDoC** (Research Domain Criteria) del NIMH, en español. Se instala en el móvil
o el escritorio, funciona sin conexión y guarda tu progreso en el dispositivo.

---

## ✨ Qué incluye esta versión

**Curso de RDoC (13 diapositivas)**
- Fundamentos, 6 dominios, 8 unidades y la matriz.
- Dimensiones transversales: **Neurodesarrollo y Ambiente**.
- Caso resuelto de ejemplo y encuadre dimensional (hipo↔hiper).
- Actividades interactivas: *¿Cuál es la diferencia?*, *Clasifica en la matriz*,
  *Dos pacientes ¿mismo perfil?* y tarjetas de repaso.
- **Check de preparación** integrador antes de los casos.
- Diapositiva de **Referencias** (estilo Vancouver).

**Modo Juego — 27 expedientes**
- Clásicos, infantojuveniles, adultos y geriátricos.
- Entrevista → clasificación en la matriz → informe → seguimiento a 6 meses.
- 6 capas de razonamiento por caso: síndrome, dominio, constructo, unidad,
  instrumento y **neurodesarrollo/ambiente** (en los casos donde aplica).
- Consecuencias clínicas de cada error, prestigio clínico y competencias.

**Otros modos**
- **Estudio** (sin puntaje, con un caso comparativo "mismo Dx, distinto perfil").
- **Supervisión** (encontrar el error en el informe de un colega).
- **Experto** (revisión por pares de un caso real; requiere API key propia).

**Experiencia**
- Efectos de sonido, animaciones de feedback y **transiciones** entre pantallas.
- **Progreso persistente** entre sesiones; opciones barajadas; modo
  **"Repasar mis fallos"**; **compartir resumen**; ajuste de **tamaño de texto**.

---

## 👩‍⚕️ Para especialistas

Es una **herramienta educativa, no diagnóstica**: los casos son ficticios y
simplificados, RDoC es un marco de investigación (complementa, no reemplaza al
DSM/CIE) y el contenido **aún no está validado por consenso**. Consulta la
pantalla *Alcance y limitaciones* dentro de la app.

Tu revisión mejora esto: si defiendes otra respuesta en algún caso, o cambiarías
un instrumento o constructo, repórtalo desde la app (*Reportar un caso
discutible*) o en los *Issues* del repositorio.

---

## 📲 Instalación

- **Móvil:** abre el enlace → menú del navegador → *Agregar a la pantalla de inicio*.
- **Escritorio:** abre el enlace → icono de *instalar* en la barra de direcciones.
- Funciona offline tras la primera visita.

---

## 🔧 Notas técnicas

- Vite + React 18 + Tailwind + lucide-react; PWA con service worker.
- Contenido y lógica modularizados (`src/data.js`, `src/logic.js`, `src/sound.jsx`).
- 121 pruebas automatizadas (integridad de datos y lógica) — `npm test`.
- Privacidad: no se recopilan datos; el progreso vive solo en tu navegador.

Fuentes del contenido: Morris et al. (2022); Cozza et al. (2023);
Arnett & Fogler (2024); Fung et al. (2014); RDoC del NIMH.
(Referencias completas dentro del curso.)

Elaborado por Jesús Valenzuela.

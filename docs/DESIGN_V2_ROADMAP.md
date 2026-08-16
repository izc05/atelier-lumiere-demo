# Atelier Lumière · Visual V2 Roadmap

## Objetivo

Rediseñar únicamente la experiencia visual pública de Atelier Lumière para conseguir una estética más moderna, limpia, editorial y premium, manteniendo intacta la lógica de negocio ya validada.

Referencia visual: lujo editorial, mucha fotografía, aire, jerarquía tipográfica, microanimación y protagonismo de marca/talleres, sin copiar una web concreta.

## Rama de trabajo

- Rama exclusiva: `feat/atelier-visual-v2`
- Base: `main`
- `main` no se modifica durante el diseño.
- Cada fase se implementa y valida por separado.
- No se fusiona a `main` hasta revisión final visual, responsive, accesibilidad, rendimiento y CI.

## Regla principal de alcance

### Se mantiene sin cambios

- autenticación;
- roles y permisos;
- RLS;
- pedidos;
- checkout;
- carrito de un único taller;
- pagos sandbox;
- presupuestos;
- encargos y conversaciones;
- logística;
- almacenamiento privado;
- API de negocio;
- modelo de seguridad;
- datos de talleres y productos;
- flujo de publicación y aprobación.

### Cambios permitidos

- HTML/CSS/JS visual;
- composición de páginas;
- tipografía;
- espaciado;
- navegación visual;
- presentación de imágenes;
- microinteracciones;
- animaciones y transiciones;
- responsive;
- componentes de escaparate;
- una extensión mínima del admin exclusivamente para gestionar imágenes/editoriales de portada y secciones públicas.

---

# FASE 0 · Seguridad y base de trabajo

Estado: ✅ creada la rama.

Objetivos:

- trabajar solo en `feat/atelier-visual-v2`;
- mantener la web actual como referencia estable;
- no desplegar esta rama sobre producción durante el proceso;
- preparar una ruta/preview separada cuando comience la implementación visual;
- un commit lógico por fase;
- CI obligatorio antes de dar una fase por cerrada.

Criterio de aceptación:

- ningún cambio de V2 llega a `main` accidentalmente;
- rollback inmediato posible volviendo a `main`.

---

# FASE 1 · Auditoría visual y sistema de diseño V2

Objetivo: crear un lenguaje visual consistente antes de rehacer páginas.

Definir:

- paleta principal:
  - marfil/blanco cálido dominante;
  - burdeos Atelier como acento;
  - negro/gris cálido para texto;
  - dorado muy contenido;
- tipografía serif editorial para titulares;
- sans serif limpia para navegación, filtros y UI;
- escalas de títulos y texto;
- anchos máximos de contenido;
- grid desktop/tablet/móvil;
- radios, líneas y sombras mínimas;
- estilo único de botones;
- estilos de enlaces editoriales;
- iconografía fina;
- tokens CSS reutilizables;
- duración y curvas de animación.

Resultado esperado:

- menos bloques burdeos completos;
- más espacio negativo;
- menos tarjetas pesadas;
- más imagen y composición editorial;
- sensación de “maison artesanal”, no marketplace genérico.

---

# FASE 2 · Marca, logo y cabecera global

Objetivo: hacer que Atelier Lumière sea reconocible desde el primer segundo.

Cambios:

- aumentar presencia visual del logo AL + Atelier Lumière;
- revisar proporciones del logo en desktop y móvil;
- header blanco/marfil más fino y ligero;
- navegación clara:
  - Tienda;
  - Talleres;
  - Historias;
  - Únete como taller;
  - Acceso talleres;
  - búsqueda/cuenta/carrito cuando corresponda;
- estados active/hover discretos;
- sticky header con transición al hacer scroll;
- menú móvil premium a pantalla completa o drawer limpio;
- contador de carrito integrado sin caja pesada.

Efectos:

- header transparente o superpuesto cuando la composición lo permita;
- cambio suave a fondo sólido al desplazarse;
- logo con transición mínima de tamaño, sin animaciones llamativas.

Criterio de aceptación:

- el logo tiene más protagonismo que ahora;
- navegación entendible en menos de 2 segundos;
- no se pierde ninguna ruta actual.

---

# FASE 3 · Home V2

Objetivo: convertir la Home en una portada visual y editorial.

## 3.1 Hero

Composición recomendada:

- fotografía o imagen editorial protagonista;
- titular corto y grande;
- subtítulo breve;
- un CTA principal;
- CTA secundario solo si realmente hace falta;
- logo/marca siempre visible y con espacio.

Eliminar o reducir:

- exceso de texto simultáneo;
- cajas sobre la imagen demasiado grandes;
- bloques burdeos dominantes;
- etiquetas que no aporten decisión inmediata.

## 3.2 Taller invitado / destacado

- fotografía real grande del taller;
- logo real del taller asociado;
- nombre;
- especialidad;
- ubicación;
- enlace “Conocer el taller”;
- opción de carrusel si hay varios destacados.

## 3.3 Talleres seleccionados

- composición visual con foto + logo;
- el logo debe ser protagonista, no un pequeño sello;
- mostrar máximo 2–4 talleres en portada;
- alternar composición para evitar cuadrícula repetitiva.

## 3.4 Piezas recién salidas del taller

- producto grande;
- foto como protagonista;
- nombre del taller;
- título;
- precio;
- CTA discreto;
- menos cajas y bordes.

## 3.5 Encargos

- bloque visual dedicado;
- una gran imagen emocional;
- explicar el concepto con muy poco texto;
- CTA hacia talleres que aceptan encargos.

## 3.6 Historias

- una historia principal editorial;
- 2 secundarias como máximo;
- fotografía grande;
- evitar aspecto de blog de tarjetas genéricas.

---

# FASE 4 · Imágenes editoriales administrables

Objetivo: que las imágenes centrales de las páginas no queden fijadas en código.

Esta es la única ampliación interna prevista dentro de V2 y se limitará a contenido visual público.

## Slots propuestos

- `home.hero.desktop`
- `home.hero.mobile`
- `home.hero.alt`
- `home.hero.focal_point`
- `home.featured_workshop`
- `shop.hero.desktop`
- `shop.hero.mobile`
- `workshops.hero.desktop`
- `workshops.hero.mobile`
- `stories.hero.desktop`
- `stories.hero.mobile`
- `commissions.hero.desktop`
- `commissions.hero.mobile`

Opcional si lo necesitamos:

- banners editoriales intermedios;
- imagen estacional;
- orden de secciones de Home;
- activación/desactivación de bloque destacado.

## Admin

Crear una sección sencilla tipo:

`Administración → Apariencia / Escaparate`

Cada slot tendrá:

- vista previa;
- subir/reemplazar imagen;
- imagen desktop;
- imagen móvil;
- texto ALT obligatorio;
- punto focal/crop;
- estado publicado;
- restaurar imagen anterior o dejar fallback seguro.

No incluir:

- cambios de permisos;
- cambios de pedidos;
- cambios de producto;
- cambios de autenticación;
- edición libre de HTML.

---

# FASE 5 · Tienda V2

Objetivo: mantener toda la funcionalidad actual, pero convertir el catálogo en un escaparate mucho más visual.

Mantener:

- búsqueda;
- filtros de categoría;
- filtros de ocasión;
- precio si existe;
- taller/proveedor;
- precios;
- navegación a ficha.

Rediseñar:

- hero de catálogo mucho más pequeño/limpio;
- filtros laterales en desktop;
- drawer de filtros en móvil;
- grid de 3 columnas desktop, 2 tablet, 1–2 móvil según ancho;
- foto ocupando la mayor parte de cada producto;
- eliminar botones pesados “Ver pieza” dentro de cada card;
- hacer toda la tarjeta o título navegable;
- añadir favorito solo si ya existe lógica; no crear funcionalidad nueva en V2;
- nombre de taller visible y elegante;
- precio limpio;
- tags reducidos o visibles solo cuando aporten valor.

Criterio:

- primero se ve el producto, después la interfaz.

---

# FASE 6 · Talleres V2

Objetivo: que los talleres asociados sean protagonistas reales de la plataforma.

Cada taller debe mostrar claramente:

- fotografía de portada real;
- logo grande del taller;
- nombre;
- especialidad;
- ubicación;
- texto breve;
- disponibilidad de encargos;
- enlace al perfil.

Diseño:

- abandonar la sensación de card de marketplace;
- composiciones amplias y editoriales;
- alternar imagen izquierda/derecha o usar bloques amplios;
- logos sobre fondos limpios con suficiente tamaño;
- filtros existentes conservados en una barra más discreta.

Móvil:

- foto;
- logo;
- nombre;
- especialidad;
- CTA;
- sin sobrecarga de metadatos.

---

# FASE 7 · Ficha pública de taller V2

Objetivo: que cada taller parezca una pequeña marca dentro de Atelier.

Orden visual:

1. portada del taller;
2. logo grande;
3. nombre + especialidad + ubicación;
4. historia/resumen;
5. galería del taller;
6. técnicas/materiales;
7. piezas disponibles;
8. encargos disponibles;
9. historias del taller si existen;
10. CTA final.

Efectos:

- pequeñas transiciones entre galería y contenido;
- hover de imágenes;
- reveal al scroll;
- nada que interfiera con lectura o accesibilidad.

---

# FASE 8 · Historias V2

Objetivo: pasar de “blog” a revista editorial de artesanía.

Página de listado:

- hero muy limpio;
- una historia destacada grande;
- categorías discretas;
- mosaico editorial para historias secundarias;
- imágenes protagonistas;
- autores/talleres visibles.

Página de artículo:

- portada grande;
- título y entradilla;
- ancho de lectura controlado;
- imágenes intercaladas;
- pull quotes si procede;
- enlace claro al taller relacionado;
- piezas relacionadas al final.

---

# FASE 9 · Encargos V2

Objetivo: conservar el proceso actual pero presentarlo de forma mucho más visual y comprensible.

Mantener el flujo:

1. Cuéntanos el momento.
2. Encuentra un taller.
3. Recibe propuesta y presupuesto.
4. Sigue el proceso hasta la pieza final.

Rediseño:

- eliminar gran masa burdeos continua;
- alternar fondo claro con fotografías;
- timeline más visual;
- ejemplo de briefing limpio;
- una imagen por etapa cuando aporte valor;
- CTA final muy visible.

---

# FASE 10 · Carrito y checkout V2

Objetivo: simplificar visualmente sin tocar absolutamente nada de la lógica de pedido.

Diseño:

- fondo claro;
- producto con miniatura;
- nombre del taller muy visible;
- cantidad y precio compactos;
- resumen de pedido fijo en desktop;
- jerarquía clara en móvil;
- campos de entrega más limpios;
- mensajes del modo piloto/sandbox visibles pero menos invasivos;
- CTA final inequívoco.

No cambiar:

- restricciones por taller;
- cálculos del servidor;
- reservas de stock;
- validaciones;
- comportamiento del checkout.

---

# FASE 11 · Efectos, movimiento y microinteracciones

Objetivo: dar sensación premium sin hacer una web pesada.

## Permitidos

- fade/reveal de texto al entrar en viewport;
- desplazamientos de 12–24 px;
- zoom de imagen 1.00 → 1.02/1.04;
- parallax muy leve en hero desktop;
- underline animado;
- transiciones de navegación;
- carruseles suaves;
- cambio del header con scroll;
- hover de foto/CTA;
- transición entre imágenes de taller destacado.

## Evitar

- scroll secuestrado;
- animaciones largas;
- partículas decorativas constantes;
- WebGL innecesario en el catálogo;
- efectos que retrasen interacción;
- movimiento en elementos de checkout;
- animaciones que dificulten lectura.

## Accesibilidad

Todos los efectos deben respetar:

`prefers-reduced-motion: reduce`

---

# FASE 12 · Biblioteca de imágenes y dirección artística

Objetivo: unificar todas las imágenes aunque procedan de distintos talleres.

Definir guía para:

- ratio hero desktop;
- ratio hero móvil;
- ratio producto;
- ratio taller;
- fotografía de logo;
- fondos;
- luz;
- temperatura;
- recorte;
- densidad de elementos;
- compresión WebP/AVIF;
- tamaño máximo;
- texto ALT.

Importante:

- los productos deben seguir siendo fotografías reales;
- los talleres deben poder mantener identidad propia;
- Atelier debe armonizar la presentación sin falsear el producto.

---

# FASE 13 · Responsive y móvil

Objetivo: no tratar móvil como una versión reducida del desktop.

Validar individualmente:

- 320–375 px;
- 390–430 px;
- tablet vertical;
- tablet horizontal;
- portátil;
- escritorio grande.

Revisar:

- logo;
- menú;
- filtros;
- cards;
- hero;
- imágenes focales;
- formularios;
- checkout;
- timelines;
- carruseles;
- áreas táctiles.

---

# FASE 14 · Rendimiento, SEO y accesibilidad

Objetivo: que el rediseño no degrade la base técnica actual.

Validar:

- LCP;
- CLS;
- carga diferida;
- preload solo de hero necesario;
- tamaños responsive;
- alt text;
- contraste;
- teclado;
- foco visible;
- labels;
- headings semánticos;
- reduced motion;
- imágenes WebP/AVIF;
- no cargar JS de animación si no es necesario.

---

# FASE 15 · Entrada / experiencia inicial de Atelier

Estado: ⏳ pendiente de referencias visuales del usuario.

Objetivo:

Diseñar una entrada propia para Atelier antes de llegar a la Home, únicamente si aporta marca y no ralentiza el acceso.

Se estudiarán ejemplos antes de decidir tecnología.

Opciones a valorar:

- logo AL construido con línea/hilo;
- bordado que aparece progresivamente;
- hilo dorado dibujando la firma;
- textura de papel/tela;
- apertura tipo editorial;
- fotografía macro con transición a Home;
- transición de color burdeos → marfil;
- entrada corta con botón “Entrar”;
- posibilidad de saltarla;
- recordar en sesión que el usuario ya la ha visto.

No se implementa hasta que el usuario entregue y apruebe referencias.

---

# FASE 16 · QA visual y funcional

Antes de considerar V2 terminada:

- comparar todas las páginas con sus capturas V1;
- verificar que todas las rutas siguen existiendo;
- probar catálogo y filtros;
- probar perfil de taller;
- probar historias;
- probar carrito;
- probar checkout piloto;
- comprobar admin de imágenes;
- comprobar imagen desktop/móvil;
- comprobar fallbacks;
- pruebas teclado;
- responsive completo;
- CI completo.

---

# FASE 17 · Revisión y publicación controlada

Proceso:

1. V2 completa en `feat/atelier-visual-v2`.
2. Demo/preview separada.
3. Revisión visual página por página.
4. Correcciones finales.
5. CI verde.
6. PR hacia `main`.
7. Revisión final del diff.
8. Merge solo con aprobación explícita.
9. Despliegue controlado en mini PC.
10. Comprobación post-deploy.

---

# Orden de trabajo recomendado

`0 Seguridad ✅ → 1 Sistema visual → 2 Header/Logo → 3 Home → 4 Imágenes administrables → 5 Tienda → 6 Talleres → 7 Ficha taller → 8 Historias → 9 Encargos → 10 Carrito → 11 Efectos → 12 Dirección de imágenes → 13 Responsive → 14 Rendimiento/Accesibilidad → 15 Entrada → 16 QA → 17 Publicación`

## Norma de aprobación

No se avanza a una pantalla importante hasta revisar visualmente la fase anterior. La prioridad es conseguir una identidad coherente, no acumular cambios.

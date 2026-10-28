# Fotos de producto de Moodi — prompt para Antigravity / Gemini

Carpeta de entrada: `docs/clientes/moodi/fotos-productos/` (14 archivos: 11 abren; 3 `.HEIC` solo los lee Gemini).
Carpeta de salida: `docs/clientes/moodi/fotos-productos/listas/` (una por producto, `nombre-del-producto.webp`).

## Prompt (pegar tal cual en Antigravity)

```
Eres fotógrafo de producto para la heladería Moodi Shake (malteadas, granizados, sodas, waffles, brownies,
fresas con crema, ensaladas de frutas, conos, canastas y copas de helado). Marca juvenil y alegre; colores de
la marca: morado profundo #5B3766, coral #F2685B y amarillo crema #FCF8C9.

Toma cada foto de la carpeta fotos-productos y genera una versión profesional para mostrar en la pantalla de
un punto de venta (miniaturas de unos 300 px, con otras 30 fotos al lado). Reglas, en este orden de importancia:

1. NO cambies el producto: mismo helado, mismas frutas, mismas salsas, mismo vaso o plato, misma cantidad.
   Es la foto de lo que el cliente recibe. No agregues ingredientes, no lo hagas más grande ni más perfecto.
2. Quita todo lo que no es el producto: la pared de madera, la mano, la mesa, las fresas sueltas, otros platos.
3. Ponlo sobre un fondo liso y claro de color amarillo crema #FCF8C9, con una sombra suave y natural debajo,
   como si estuviera sobre una superficie. Todas las fotos deben verse del mismo estudio.
4. Formato cuadrado 1024x1024, el producto centrado y ocupando el 75 % del alto, visto de frente y un poco
   desde arriba (unos 20 grados), igual en todas.
5. Luz de día suave y pareja, colores reales (que la fresa se vea fresa, no neón), nitidez normal; sin texto,
   sin logos, sin marcas de agua, sin filtros.
6. Guarda cada resultado como WEBP de calidad 85 en la carpeta listas/ con el nombre del archivo original en
   minúsculas y sin espacios (ej. canasta-de-fresa.webp). Los .HEIC conviértelos primero.

Cuando termines, muéstrame una cuadrícula con las 14 para revisarlas juntas.
```

## Notas
- Las 4 fotos de café (capuchino, espresso, latte caliente, latte frío) son de stock y no están en el menú cargado:
  confirmar con Moodi si venden café antes de usarlas.
- Si una foto queda rara al quitar el fondo (vasos de vidrio con la soda, por ejemplo), pedirle a Gemini que repita
  solo esa: "repite soda-manguito-viche.webp, el vidrio quedó opaco: debe verse transparente con el verde adentro".
- Al cargarlas en el POS: Menú → producto → foto. Las que no tengan foto siguen con la provisional del logo.

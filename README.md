# Vectorizer Backend (Node.js + Fastify)

Backend listo para producción orientado a logos, ilustraciones simples y gráficos de alto contraste.

## Stack

- Node.js LTS (>=20)
- Fastify (alto rendimiento y baja sobrecarga)
- @fastify/multipart (upload multipart)
- Sharp (upscale + preprocesamiento)
- Potrace (vectorización SVG + posterización por capas)
- SVGO (optimización SVG)
- UUID (identificadores únicos)
- dotenv
- fs/promises (fallback temporal seguro)

## Estructura

```text
src/
  config/
  controllers/
  middlewares/
  routes/
  services/
  utils/
```

## Endpoints

- `POST /api/vectorize`: vectorización básica monocromo
- `POST /api/vectorize/advanced`: controles finos (`threshold`, `turdSize`, `optCurve`, `optTolerance`, `colorMode`, `paletteSize`)
- `POST /api/upscale-vectorize`: controles de upscale + vectorización (`scale`, `mode`, ...)
- `POST /api/vectorize/color`: vectorización orientada a logos multicolor (2-8 capas)
- `GET /api/metrics`: métricas básicas
- `GET /api/health`: healthcheck

## Pipeline implementado

1. Upload multipart
2. Validación de tipo/tamaño/corrupción
3. Upscale 2x/4x con kernel Lanczos3
4. Preprocesamiento:
   - `monochrome`: grayscale + contraste + reducción de ruido + binarización
   - `palette`: normalización + reducción de ruido + cuantización de paleta
5. Vectorización Potrace:
   - `monochrome`: `trace`
   - `palette`: `posterize` por capas con fills separados
6. Post-procesamiento SVG: limpieza, optimización y separación de paths editables
7. Respuesta JSON con SVG

## Parámetros y rangos recomendados

- `threshold`: `0..255` (recomendado logos: `140..190`)
- `turdSize`: `0..25` (recomendado detalle fino: `1..2`)
- `optCurve`: `true|false`
- `optTolerance`: `0.01..1` (default `0.2`)
- `colorMode`: `monochrome|palette`
- `paletteSize`: `2..8` (para logos normalmente `2..4`)
- `scale`: `2|4`
- `mode`: `fast|quality`
- `fillStrategy`: `dominant|mean|median|spread` (solo en `palette`)

## Ejecutar

1. Instalar dependencias:

```bash
npm install
```

2. Configurar entorno:

```bash
cp .env.example .env
```

3. Iniciar en desarrollo:

```bash
npm run dev
```

4. Iniciar en producción:

```bash
npm start
```

## Ejemplos curl

### 1) Básico monocromo

```bash
curl -X POST http://localhost:3000/api/vectorize \
  -F "file=@/ruta/logo.png"
```

### 2) Advanced monocromo (con detalle fino)

```bash
curl -X POST http://localhost:3000/api/vectorize/advanced \
  -F "file=@/ruta/logo.jpg" \
  -F "threshold=170" \
  -F "turdSize=2" \
  -F "optCurve=true" \
  -F "optTolerance=0.2"
```

### 3) Upscale + vectorize palette (multicolor)

```bash
curl -X POST http://localhost:3000/api/upscale-vectorize \
  -F "file=@/ruta/logo.png" \
  -F "scale=4" \
  -F "mode=quality" \
  -F "colorMode=palette" \
  -F "paletteSize=3" \
  -F "fillStrategy=dominant" \
  -F "threshold=170" \
  -F "turdSize=2" \
  -F "optCurve=true" \
  -F "optTolerance=0.2"
```

### 4) Endpoint dedicado color

```bash
curl -X POST http://localhost:3000/api/vectorize/color \
  -F "file=@/ruta/logo-color.png" \
  -F "paletteSize=3" \
  -F "fillStrategy=dominant"
```

Respuesta:

```json
{
  "success": true,
  "svg": "<svg>...</svg>"
}
```

## Notas de producción

- Procesamiento mayormente en memoria
- Fallback temporal con limpieza automática (`fs/promises`) si Potrace falla con buffer
- Cola interna (`p-queue`) para controlar concurrencia en cargas altas
- Caché LRU con TTL para solicitudes repetidas
- Logs estructurados con Fastify
- Validación de entrada y manejo robusto de errores

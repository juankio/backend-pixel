import { optimize } from 'svgo';

const PATH_TAG_REGEX = /<path\b([^>]*?)\/?>(?:<\/path>)?/gi;
const ATTR_REGEX = /([:\w-]+)\s*=\s*"([^"]*)"/g;

function parseAttributes(raw = '') {
  const attributes = {};
  let match;

  while ((match = ATTR_REGEX.exec(raw))) {
    attributes[match[1]] = match[2];
  }

  return attributes;
}

function parseStyle(styleValue = '') {
  const style = {};

  for (const declaration of styleValue.split(';')) {
    const [rawKey, rawValue] = declaration.split(':');
    const key = rawKey?.trim();
    const value = rawValue?.trim();

    if (key && value) {
      style[key] = value;
    }
  }

  return style;
}

function toAttributeString(attributes) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');
}

function removeRawMetadata(svg) {
  return svg
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
    .trim();
}

function ensureViewBox(svg) {
  if (/viewBox="[^"]+"/i.test(svg)) {
    return svg;
  }

  const widthMatch = svg.match(/width="([0-9.]+)(px)?"/i);
  const heightMatch = svg.match(/height="([0-9.]+)(px)?"/i);

  if (!widthMatch || !heightMatch) {
    return svg;
  }

  const width = Number.parseFloat(widthMatch[1]);
  const height = Number.parseFloat(heightMatch[1]);

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return svg;
  }

  return svg.replace(/<svg\b/i, `<svg viewBox="0 0 ${width} ${height}" `);
}

function normalizePathData(pathData = '') {
  return pathData.replace(/\s+/g, ' ').trim();
}

function normalizePathAttributes(attrs, index) {
  const style = parseStyle(attrs.style || '');
  const fill = attrs.fill || style.fill || '#000000';
  const strokeFromAttrs = attrs.stroke || style.stroke;
  const hasExplicitStroke = strokeFromAttrs && strokeFromAttrs !== 'none';
  const stroke = hasExplicitStroke ? strokeFromAttrs : (fill !== 'none' ? fill : 'none');
  const strokeWidth = attrs['stroke-width'] || style['stroke-width'] || '1';

  const normalized = {
    ...attrs,
    fill,
    stroke,
    'stroke-width': stroke === 'none' ? undefined : strokeWidth,
    'stroke-linejoin': stroke === 'none' ? undefined : (attrs['stroke-linejoin'] || 'round'),
    'stroke-linecap': stroke === 'none' ? undefined : (attrs['stroke-linecap'] || 'round'),
    'vector-effect': stroke === 'none' ? undefined : 'non-scaling-stroke',
    'fill-rule': attrs['fill-rule'] || 'evenodd',
    'clip-rule': attrs['clip-rule'] || 'evenodd',
    class: `vector-path vector-path-${index}`,
    'data-layer-id': String(index),
    'data-layer-fill': fill,
    'data-layer-stroke': stroke,
    d: normalizePathData(attrs.d || '')
  };

  delete normalized.style;
  return normalized;
}

function dedupeAndPreparePaths(svg) {
  const extractedPaths = [];

  const bodyWithoutPaths = svg.replace(PATH_TAG_REGEX, (_full, rawAttributes) => {
    extractedPaths.push(parseAttributes(rawAttributes));
    return '';
  });

  if (!extractedPaths.length) {
    return svg;
  }

  const preparedLayers = [];
  const geometryIndex = new Map();

  for (const attrs of extractedPaths) {
    const pathData = normalizePathData(attrs.d || '');
    if (!pathData) {
      continue;
    }

    const fill = attrs.fill || parseStyle(attrs.style || '').fill || '#000000';
    const geometryKey = pathData;
    const existingIndex = geometryIndex.get(geometryKey);

    if (existingIndex !== undefined) {
      const existing = preparedLayers[existingIndex];
      const existingFill = existing.fill || '#000000';

      // Mantener una sola geometria por zona, priorizando capa visible frente a fill="none".
      if (existingFill === 'none' && fill !== 'none') {
        preparedLayers[existingIndex] = { ...attrs, d: pathData, fill };
      }
      continue;
    }

    geometryIndex.set(geometryKey, preparedLayers.length);
    preparedLayers.push({ ...attrs, d: pathData, fill });
  }

  const preparedPathTags = [];
  let pathIndex = 0;

  for (const layer of preparedLayers) {
    pathIndex += 1;
    const normalizedAttrs = normalizePathAttributes(layer, pathIndex);
    preparedPathTags.push(`<path ${toAttributeString(normalizedAttrs)} />`);
  }

  if (!preparedPathTags.length) {
    return bodyWithoutPaths;
  }

  if (/<\/svg>\s*$/i.test(bodyWithoutPaths)) {
    return bodyWithoutPaths.replace(/<\/svg>\s*$/i, `${preparedPathTags.join('')}</svg>`);
  }

  return `${bodyWithoutPaths}${preparedPathTags.join('')}`;
}

export function optimizeEditableSvg(svg) {
  const cleaned = ensureViewBox(dedupeAndPreparePaths(removeRawMetadata(svg)));

  const result = optimize(cleaned, {
    multipass: true,
    js2svg: {
      pretty: false
    },
    plugins: [
      'removeDoctype',
      'removeXMLProcInst',
      'removeComments',
      'removeMetadata',
      'removeEditorsNSData',
      'removeDimensions',
      {
        name: 'cleanupNumericValues',
        params: { floatPrecision: 3 }
      },
      {
        name: 'convertPathData',
        params: { floatPrecision: 3 }
      },
      {
        name: 'mergePaths',
        active: false
      },
      {
        name: 'removeUnknownsAndDefaults',
        params: {
          keepDataAttrs: true
        }
      }
    ]
  });

  return result.data;
}

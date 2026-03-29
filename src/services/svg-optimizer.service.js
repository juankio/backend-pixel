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

function toAttributeString(attributes) {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');
}

function splitPathByMove(pathData = '') {
  const matches = pathData.match(/[Mm][^Mm]*/g);
  if (!matches || matches.length <= 1) {
    return [pathData.trim()].filter(Boolean);
  }

  return matches.map((segment) => segment.trim()).filter(Boolean);
}

function removeRawMetadata(svg) {
  return svg
    .replace(/<\?xml[^>]*\?>/gi, '')
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<metadata[\s\S]*?<\/metadata>/gi, '')
    .trim();
}

function splitAndPreparePaths(svg) {
  let pathIndex = 0;

  return svg.replace(PATH_TAG_REGEX, (_full, rawAttributes) => {
    const attrs = parseAttributes(rawAttributes);
    const d = attrs.d || '';
    const segments = splitPathByMove(d);

    if (!segments.length) {
      return '';
    }

    return segments
      .map((segment) => {
        pathIndex += 1;

        const safeAttrs = {
          ...attrs,
          d: segment,
          fill: attrs.fill || '#000000',
          stroke: 'none',
          class: `vector-path vector-path-${pathIndex}`
        };

        delete safeAttrs.style;
        return `<path ${toAttributeString(safeAttrs)} />`;
      })
      .join('');
  });
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

export function optimizeEditableSvg(svg) {
  const cleaned = ensureViewBox(splitAndPreparePaths(removeRawMetadata(svg)));

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

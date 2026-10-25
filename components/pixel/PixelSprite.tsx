import type { CSSProperties } from 'react';

export interface PixelSpriteProps {
  /** Rows of equal length; each character is one pixel, '.' or ' ' is transparent. */
  rows: string[];
  /** Maps sprite characters to CSS colors. */
  palette: Record<string, string>;
  /** Rendered size of one sprite pixel in CSS px. */
  scale?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

/** Renders a text-grid sprite as crisp SVG pixels. */
export function PixelSprite({ rows, palette, scale = 4, className, style, title }: PixelSpriteProps) {
  const width = Math.max(...rows.map((r) => r.length));
  const height = rows.length;
  const rects: React.ReactElement[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || ch === ' ' || !palette[ch]) {
        x++;
        continue;
      }
      let run = 1;
      while (row[x + run] === ch) run++;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={palette[ch]} />);
      x += run;
    }
  });
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width * scale}
      height={height * scale}
      shapeRendering="crispEdges"
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {rects}
    </svg>
  );
}

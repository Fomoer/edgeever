import { Color, Gradient, Path, Rect, type FabricObject } from "fabric";

// Vector fibres survive the existing poster JSON and PNG/JPEG renderers. Keep
// them in a few compound paths rather than thousands of selectable layers.
export function paperListPaper(width: number, height: number, ink: string): FabricObject[] {
  let seed = 731;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const unit = Math.min(width, height) / 1080;
  const anchor = `M 0 0 L ${width} 0 M ${width} ${height} L 0 ${height}`;
  const layers: FabricObject[] = [];
  for (const light of [false, true]) {
    let path = anchor;
    for (let index = 0; index < 1000; index++) {
      const x = (random() * (width - 4 * unit)).toFixed(2);
      const y = (random() * (height - 2 * unit)).toFixed(2);
      const length = ((0.7 + random() * 2.5) * unit).toFixed(2);
      const thickness = ((0.4 + random() * 0.8) * unit).toFixed(2);
      path += ` M ${x} ${y} h ${length} v ${thickness} h -${length} Z`;
    }
    const fibres = new Path(path, { left: 0, top: 0, originX: 'left', originY: 'top', fill: light ? '#ffffff' : ink, opacity: light ? 0.18 : 0.065, strokeWidth: 0 });
    Object.assign(fibres, { qcName: `paper-list:paper:${light ? 'light' : 'dark'}-fibres` });
    layers.push(fibres);
  }
  const light = new Rect({ left: 0, top: 0, originX: 'left', originY: 'top', width, height, strokeWidth: 0, fill: new Gradient({
    type: 'radial', coords: { x1: width * 0.3, y1: height * 0.2, r1: 0, x2: width * 0.3, y2: height * 0.2, r2: Math.max(width, height) * 0.8 },
    colorStops: [{ offset: 0, color: 'rgba(255,255,255,0.27)' }, { offset: 1, color: 'rgba(255,255,255,0)' }],
  }) });
  Object.assign(light, { qcName: 'paper-list:paper:soft-light' });
  layers.unshift(light);
  // One faint diagonal crease and uneven page wear avoid the hard edges
  // and repeated cross patterns of decorative fold bands.
  const [red, green, blue] = new Color(ink).getSource();
  const shade = (alpha: number) => `rgba(${red},${green},${blue},${alpha})`;
  for (const [x1, y1, x2, y2, peak] of [[0.18, 0.72, 0.5, 0.08, 0.022], [0.72, 0.88, 0.18, 0.32, 0.014]]) {
    const crease = new Rect({
      left: 0, top: 0, width, height, originX: 'left', originY: 'top', strokeWidth: 0,
      fill: new Gradient({ type: 'linear', coords: { x1: width * x1, y1: height * y1, x2: width * x2, y2: height * y2 }, colorStops: [
        { offset: 0, color: shade(0) },
        { offset: 0.33, color: shade(0) },
        { offset: 0.46, color: shade(peak) },
        { offset: 0.5, color: shade(peak * 0.6) },
        { offset: 0.53, color: 'rgba(255,255,255,0.09)' },
        { offset: 0.61, color: 'rgba(255,255,255,0.02)' },
        { offset: 0.78, color: shade(0) },
        { offset: 1, color: shade(0) },
      ] }),
    });
    if (x1 > 0.5) crease.set({ fill: new Gradient({
      type: 'radial', coords: { x1: width * 0.04, y1: height * 0.84, r1: 0, x2: width * 0.04, y2: height * 0.84, r2: Math.max(width, height) * 0.7 },
      colorStops: [{ offset: 0, color: shade(0.032) }, { offset: 0.5, color: shade(0.014) }, { offset: 1, color: shade(0) }],
    }) });
    Object.assign(crease, { qcName: 'paper-list:paper:crease' });
    layers.push(crease);
  }
  const grain = new Rect({ left: 0, top: 0, width, height, originX: 'left', originY: 'top', fill: '#ffffff', opacity: 0.045, strokeWidth: 0 });
  Object.assign(grain, { qcName: 'paper-list:paper:grain' });
  layers.push(grain);
  return layers;
}

import type { FabPresentation } from './fab';

export const defaultFabPosition: FabPresentation['defaultPosition'] = ({ width, height, mobile, size }) => ({
  x: width - (mobile ? 58 : 60) - size * 2 - 10,
  y: height - (mobile ? 144 : 124),
});

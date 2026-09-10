import { flip, offset, shift, type ComputePositionConfig } from "@floating-ui/react-dom";

/** Keep resource actions outside the image, separate from its in-image controls. */
export const imageResourceMenuPosition: Partial<ComputePositionConfig> = {
  placement: "bottom-end",
  strategy: "fixed",
  middleware: [
    offset(({ rects }) => Math.max(8, 56 - rects.reference.height)),
    flip({ padding: 12 }),
    shift({ padding: 12 }),
  ],
};

/** Attach native SVG without relaxing style-src 'self'. Native geometry stays
 * untouched; generated styles enter through the CSSOM, never executable markup. */
export declare function attachLiniSvg(container: HTMLElement, text: string): {
    svg: SVGSVGElement;
    destroy(): void;
};

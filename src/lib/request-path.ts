/**
 * The request header the middleware stamps with the page's pathname, so server
 * layouts (which cannot see the URL) can re-check access. The middleware always
 * overwrites it, so a value a browser sends is never read.
 */
export const PATHNAME_HEADER = "x-educraft-pathname";

/**
 * What no answer of the park's may use (OP-246): the park needs none of these, so no script on it gets
 * them. The Worker sets it on its answers, and the static files' public/_headers says the same. It
 * sits in a file of its own, with no imports, so the Worker can load it under plain Node too.
 */
export const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()';

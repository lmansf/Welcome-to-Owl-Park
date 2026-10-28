import files from 'virtual:art-files';

/** The art this build ships (file names in public/art), so each piece is asked for by a name it has (OP-129). */
export const PUBLISHED_ART: ReadonlySet<string> = new Set(files);

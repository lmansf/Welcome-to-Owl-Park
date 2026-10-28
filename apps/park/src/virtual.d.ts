/** The art files this build ships (`public/art`, file names only), from vite.config.ts. */
declare module 'virtual:art-files' {
  const files: readonly string[];
  export default files;
}

/** The art files this build ships (`public/art`), each name with a short hash of its content, and its size in bytes, from vite.config.ts. */
declare module 'virtual:art-files' {
  const files: Readonly<Record<string, string>>;
  export default files;
  export const sizes: Readonly<Record<string, number>>;
}

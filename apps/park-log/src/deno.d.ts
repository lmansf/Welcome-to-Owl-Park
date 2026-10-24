/** The little of Deno's runtime that index.ts uses, so it typechecks here (it runs on Deno, never in Node). */
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};

/** The little of postgres.js that index.ts uses (Deno fetches it from npm when the function is deployed). */
declare module 'npm:postgres@3.4.9' {
  export default function postgres(url: string, options?: { prepare?: boolean; max?: number }): { unsafe(query: string, params: unknown[]): PromiseLike<unknown> };
}

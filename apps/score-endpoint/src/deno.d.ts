/** The little of Deno's runtime that index.ts uses, so it typechecks here (it runs on Deno, never in Node). */
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};

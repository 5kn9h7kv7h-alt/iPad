// tsc で型チェックするための最小限の宣言（Deno 実行時はグローバルに存在する）。
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

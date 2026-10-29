// The contract. One method per data-plane capability. Implementations may change;
// this interface must not.
export interface DataPlaneClient {
  orchestrator(path: string, init?: RequestInit): Promise<Response>;
  storage(path: string, init?: RequestInit): Promise<Response>;
}

// Primary implementation: Workers VPC Service bindings.
//
// host and port come from the VPC Service configuration and are ignored in the
// URL, so SSRF is structurally impossible on this path. [A5, verified 2026-10-29]
export class VpcServiceClient implements DataPlaneClient {
  constructor(
    private readonly orchestrator: Fetcher,
    private readonly storage: Fetcher,
    // Held as a Worker secret. The tunnel leg is already encrypted but the
    // binding is not a credential: nothing in the Workers VPC path injects a
    // service token or an Access JWT, so the origin must authenticate the
    // caller itself. [A5 1.3]
    private readonly originToken: string,
  ) {}

  orchestrator(path: string, init: RequestInit = {}): Promise<Response> {
    return this.call(this.orchestrator, path, init);
  }

  storage(path: string, init: RequestInit = {}): Promise<Response> {
    return this.call(this.storage, path, init);
  }

  private call(
    binding: Fetcher,
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.originToken}`);
    return binding.fetch(`https://dataplane.invalid${path}`, {
      ...init,
      headers,
    });
  }
}

// Fallback implementation: plain HTTPS to a public hostname behind Access.
//
// Exercised by a test in Phase 4 even though it is never used in production.
// If Workers VPC is withdrawn under SSSA section 5, this is the file you edit.
export class AccessHostnameClient implements DataPlaneClient {
  constructor(
    private readonly orchestratorBase: string,
    private readonly storageBase: string,
    private readonly serviceTokenId: string,
    private readonly serviceTokenSecret: string,
  ) {}

  orchestrator(path: string, init: RequestInit = {}): Promise<Response> {
    return this.call(this.orchestratorBase, path, init);
  }

  storage(path: string, init: RequestInit = {}): Promise<Response> {
    return this.call(this.storageBase, path, init);
  }

  private call(
    base: string,
    path: string,
    init: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("CF-Access-Client-Id", this.serviceTokenId);
    headers.set("CF-Access-Client-Secret", this.serviceTokenSecret);
    return fetch(`${base}${path}`, { ...init, headers });
  }
}

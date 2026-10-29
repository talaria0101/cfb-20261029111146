// Portable across Cloudflare Workers and cfb-node. No Cloudflare type appears
// outside the adapter modules in SPEC.md section 2.1.

pub trait ObjectStore {
    async fn get(&self, key: &str) -> Result<Bytes>;
    async fn put(&self, key: &str, body: Bytes) -> Result<()>;
    async fn delete(&self, key: &str) -> Result<()>;
    async fn list(&self, prefix: &str) -> Result<Vec<String>>;
}

pub trait SqlDatabase {
    async fn query(&self, sql: &str, params: &[Value]) -> Result<Vec<Row>>;
    async fn exec(&self, sql: &str, params: &[Value]) -> Result<u64>;
}

pub trait JobQueue {
    /// Pull a batch. `visibility_ms` is the lease duration; 12 h is the Cloudflare
    /// Queues maximum and the value to design long jobs around [A4 2.2].
    async fn pull(&self, batch: usize, visibility_ms: u64) -> Result<Vec<Lease>>;
    async fn ack(&self, lease: &Lease) -> Result<()>;
    /// 128 KB cap. Descriptors go in the message; payloads go in ObjectStore.
    async fn publish(&self, body: &[u8]) -> Result<()>;
}

/// How the platform resolves a process environment. Borrowed from mirrord [E5 1.7]:
/// the platform value wins, a local-only variable survives, and the exclusion list
/// is the set the host always wins so PATH, HOME and TMPDIR do not leak.
pub trait EnvResolver {
    fn resolve(&self, name: &str) -> Option<String>;
}

pub const HOST_WINS: &[&str] = &[
    "PATH", "HOME", "TMPDIR", "TEMP", "TMP", "USER", "LOGNAME", "SHELL",
    "GOPATH", "GEM_HOME", "JAVA_HOME", "CARGO_HOME", "RUSTUP_HOME",
    "LANG", "LC_ALL", "TERM", "PWD", "XDG_RUNTIME_DIR", "XDG_CONFIG_HOME",
];

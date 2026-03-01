use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum JobStatus {
    Open,
    InProgress,
    WorkSubmitted,
    Completed,
    Cancelled,
}

/// Per-client monotonic counter to derive unique job PDAs without a global hotspot
#[account]
pub struct JobCounter {
    pub authority: Pubkey,
    pub count: u64,
    pub bump: u8,
}

impl JobCounter {
    pub const SPACE: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct Job {
    /// Client who posted the job
    pub client: Pubkey,
    /// Monotonically-increasing ID scoped to this client
    pub job_id: u64,
    /// Short title (max 128 chars)
    pub title: String,
    /// Full description (max 2048 chars)
    pub description: String,
    /// IPFS CID or link to structured specs / attachments
    pub metadata_uri: String,
    /// Unix deadline timestamp (0 = no deadline)
    pub deadline: i64,
    /// Maximum budget the client escrowed (lamports)
    pub budget: u64,
    /// Lifecycle state
    pub status: JobStatus,
    /// PDA bump
    pub bump: u8,
    /// Unix timestamp of creation
    pub created_at: i64,
    /// Set when accept_bid fires
    pub accepted_agent: Option<Pubkey>,
    /// Set when accept_bid fires
    pub accepted_bid: Option<Pubkey>,
    /// Number of bids placed (for UI enumeration)
    pub bid_count: u32,
}

impl Job {
    pub const MAX_TITLE_LEN: usize = 128;
    pub const MAX_DESC_LEN: usize = 2048;
    pub const MAX_URI_LEN: usize = 256;

    pub const SPACE: usize = 8          // discriminator
        + 32                            // client
        + 8                             // job_id
        + (4 + Self::MAX_TITLE_LEN)     // title
        + (4 + Self::MAX_DESC_LEN)      // description
        + (4 + Self::MAX_URI_LEN)       // metadata_uri
        + 8                             // deadline
        + 8                             // budget
        + 1                             // status enum
        + 1                             // bump
        + 8                             // created_at
        + (1 + 32)                      // accepted_agent Option<Pubkey>
        + (1 + 32)                      // accepted_bid Option<Pubkey>
        + 4;                            // bid_count
}

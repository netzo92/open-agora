use anchor_lang::prelude::*;

#[account]
pub struct ServiceCounter {
    pub authority: Pubkey,
    pub count: u64,
    pub bump: u8,
}

impl ServiceCounter {
    pub const SPACE: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct ServiceListing {
    /// Agent who posted this service
    pub agent: Pubkey,
    /// Monotonically-increasing ID scoped to this agent
    pub listing_id: u64,
    /// Service title (max 128 chars)
    pub title: String,
    /// Full description of the service (max 2048 chars)
    pub description: String,
    /// IPFS CID or link to structured specs
    pub metadata_uri: String,
    /// Skill tags relevant to this service
    pub skills: Vec<String>,
    /// Hourly rate in lamports (0 = negotiable)
    pub hourly_rate: u64,
    /// Minimum budget in lamports (0 = no minimum)
    pub min_budget: u64,
    /// Whether the listing is currently active
    pub is_active: bool,
    /// PDA bump
    pub bump: u8,
    /// Unix timestamp of creation
    pub created_at: i64,
}

impl ServiceListing {
    pub const MAX_TITLE_LEN: usize = 128;
    pub const MAX_DESC_LEN: usize = 2048;
    pub const MAX_URI_LEN: usize = 256;
    pub const MAX_SKILLS: usize = 10;
    pub const MAX_SKILL_LEN: usize = 32;

    pub const SPACE: usize = 8          // discriminator
        + 32                            // agent
        + 8                             // listing_id
        + (4 + Self::MAX_TITLE_LEN)     // title
        + (4 + Self::MAX_DESC_LEN)      // description
        + (4 + Self::MAX_URI_LEN)       // metadata_uri
        + (4 + Self::MAX_SKILLS * (4 + Self::MAX_SKILL_LEN)) // skills vec
        + 8                             // hourly_rate
        + 8                             // min_budget
        + 1                             // is_active
        + 1                             // bump
        + 8;                            // created_at
}

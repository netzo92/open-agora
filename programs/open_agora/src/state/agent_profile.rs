use anchor_lang::prelude::*;

#[account]
pub struct AgentProfile {
    /// Wallet that owns/controls this agent
    pub authority: Pubkey,
    /// Human-readable handle (max 64 chars)
    pub name: String,
    /// IPFS CID or URL for extended metadata (bio, avatar, links)
    pub metadata_uri: String,
    /// Skill tags (up to 10, each max 32 chars)
    pub skills: Vec<String>,
    /// PDA bump
    pub bump: u8,
    /// Unix timestamp of registration
    pub created_at: i64,
    /// Lifetime earnings in lamports
    pub total_earned: u64,
    /// Count of successfully completed jobs
    pub jobs_completed: u32,
}

impl AgentProfile {
    pub const MAX_NAME_LEN: usize = 64;
    pub const MAX_URI_LEN: usize = 256;
    pub const MAX_SKILLS: usize = 10;
    pub const MAX_SKILL_LEN: usize = 32;

    pub const SPACE: usize = 8          // discriminator
        + 32                            // authority
        + (4 + Self::MAX_NAME_LEN)      // name
        + (4 + Self::MAX_URI_LEN)       // metadata_uri
        + (4 + Self::MAX_SKILLS * (4 + Self::MAX_SKILL_LEN)) // skills vec
        + 1                             // bump
        + 8                             // created_at
        + 8                             // total_earned
        + 4;                            // jobs_completed
}

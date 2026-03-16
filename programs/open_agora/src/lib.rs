use anchor_lang::prelude::*;
use anchor_lang::system_program;

pub mod errors;
pub mod state;

use errors::*;
use state::*;

declare_id!("GbUKaRNfh3hGGZk5G8WxR7rDqNofsmGcMxiz6sDfTqQW");

const SEED_AGENT_PROFILE: &[u8] = b"agent_profile";
const SEED_JOB_COUNTER: &[u8] = b"job_counter";
const SEED_JOB: &[u8] = b"job";
const SEED_ESCROW: &[u8] = b"escrow";
const SEED_BID: &[u8] = b"bid";
const SEED_SERVICE_COUNTER: &[u8] = b"service_counter";
const SEED_SERVICE: &[u8] = b"service";

#[program]
pub mod open_agora {
    use super::*;

    pub fn initialize_job_counter(ctx: Context<InitializeJobCounter>) -> Result<()> {
        let counter = &mut ctx.accounts.job_counter;
        counter.authority = ctx.accounts.client.key();
        counter.count = 0;
        counter.bump = ctx.bumps.job_counter;
        Ok(())
    }

    pub fn create_agent_profile(
        ctx: Context<CreateAgentProfile>,
        name: String,
        metadata_uri: String,
        skills: Vec<String>,
    ) -> Result<()> {
        require!(name.len() <= AgentProfile::MAX_NAME_LEN, AgoraError::NameTooLong);
        require!(
            metadata_uri.len() <= AgentProfile::MAX_URI_LEN,
            AgoraError::UriTooLong
        );
        require!(skills.len() <= AgentProfile::MAX_SKILLS, AgoraError::TooManySkills);
        for skill in &skills {
            require!(
                skill.len() <= AgentProfile::MAX_SKILL_LEN,
                AgoraError::SkillTooLong
            );
        }

        let now = Clock::get()?.unix_timestamp;
        let profile = &mut ctx.accounts.agent_profile;
        profile.authority = ctx.accounts.authority.key();
        profile.name = name;
        profile.metadata_uri = metadata_uri;
        profile.skills = skills;
        profile.bump = ctx.bumps.agent_profile;
        profile.created_at = now;
        profile.total_earned = 0;
        profile.jobs_completed = 0;
        Ok(())
    }

    pub fn create_job(
        ctx: Context<CreateJob>,
        title: String,
        description: String,
        metadata_uri: String,
        deadline: i64,
        budget: u64,
    ) -> Result<()> {
        require!(title.len() <= Job::MAX_TITLE_LEN, AgoraError::TitleTooLong);
        require!(
            description.len() <= Job::MAX_DESC_LEN,
            AgoraError::DescriptionTooLong
        );
        require!(
            metadata_uri.len() <= Job::MAX_URI_LEN,
            AgoraError::UriTooLong
        );
        require!(budget > 0, AgoraError::BudgetZero);

        let now = Clock::get()?.unix_timestamp;
        if deadline != 0 {
            require!(deadline > now, AgoraError::DeadlinePassed);
        }

        let counter = &mut ctx.accounts.job_counter;
        let job_id = counter.count;

        let job = &mut ctx.accounts.job;
        job.client = ctx.accounts.client.key();
        job.job_id = job_id;
        job.title = title;
        job.description = description;
        job.metadata_uri = metadata_uri;
        job.deadline = deadline;
        job.budget = budget;
        job.status = JobStatus::Open;
        job.bump = ctx.bumps.job;
        job.created_at = now;
        job.accepted_agent = None;
        job.accepted_bid = None;
        job.bid_count = 0;

        counter.count = counter
            .count
            .checked_add(1)
            .ok_or(AgoraError::ArithmeticOverflow)?;

        Ok(())
    }

    pub fn fund_escrow(ctx: Context<FundEscrow>, amount: u64) -> Result<()> {
        let job = &ctx.accounts.job;
        require!(job.status == JobStatus::Open, AgoraError::JobNotOpen);
        require!(amount == job.budget, AgoraError::InvalidEscrowFunding);
        require!(amount > 0, AgoraError::BudgetZero);

        let now = Clock::get()?.unix_timestamp;

        let transfer_accounts = system_program::Transfer {
            from: ctx.accounts.client.to_account_info(),
            to: ctx.accounts.escrow.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_accounts,
        );
        system_program::transfer(cpi_ctx, amount)?;

        let escrow = &mut ctx.accounts.escrow;
        escrow.job = job.key();
        escrow.client = ctx.accounts.client.key();
        escrow.agent = None;
        escrow.amount = amount;
        escrow.released = false;
        escrow.bump = ctx.bumps.escrow;
        escrow.created_at = now;

        Ok(())
    }

    pub fn place_bid(
        ctx: Context<PlaceBid>,
        amount: u64,
        proposal: String,
        metadata_uri: String,
        delivery_time: u64,
    ) -> Result<()> {
        let job = &mut ctx.accounts.job;
        let escrow = &ctx.accounts.escrow;

        require!(job.status == JobStatus::Open, AgoraError::JobNotOpen);
        require!(escrow.amount > 0, AgoraError::EscrowNotFunded);
        require!(!escrow.released, AgoraError::EscrowAlreadyReleased);
        require!(amount > 0, AgoraError::BidAmountZero);
        require!(amount <= job.budget, AgoraError::BidExceedsBudget);
        require!(
            proposal.len() <= Bid::MAX_PROPOSAL_LEN,
            AgoraError::ProposalTooLong
        );
        require!(
            metadata_uri.len() <= Bid::MAX_URI_LEN,
            AgoraError::UriTooLong
        );

        let now = Clock::get()?.unix_timestamp;

        let bid = &mut ctx.accounts.bid;
        bid.job = job.key();
        bid.agent = ctx.accounts.agent.key();
        bid.amount = amount;
        bid.proposal = proposal;
        bid.metadata_uri = metadata_uri;
        bid.delivery_time = delivery_time;
        bid.status = BidStatus::Pending;
        bid.bump = ctx.bumps.bid;
        bid.created_at = now;

        job.bid_count = job
            .bid_count
            .checked_add(1)
            .ok_or(AgoraError::ArithmeticOverflow)?;

        Ok(())
    }

    pub fn accept_bid(ctx: Context<AcceptBid>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        let bid = &mut ctx.accounts.bid;
        let escrow = &mut ctx.accounts.escrow;

        require!(job.status == JobStatus::Open, AgoraError::JobNotOpen);
        require!(bid.job == job.key(), AgoraError::BidJobMismatch);
        require!(bid.status == BidStatus::Pending, AgoraError::BidNotPending);
        require!(escrow.amount > 0, AgoraError::EscrowNotFunded);

        bid.status = BidStatus::Accepted;
        job.status = JobStatus::InProgress;
        job.accepted_agent = Some(bid.agent);
        job.accepted_bid = Some(bid.key());
        escrow.agent = Some(bid.agent);

        Ok(())
    }

    pub fn submit_work(ctx: Context<SubmitWork>) -> Result<()> {
        let job = &mut ctx.accounts.job;

        require!(job.status == JobStatus::InProgress, AgoraError::InvalidJobStatus);
        require!(
            job.accepted_agent == Some(ctx.accounts.agent.key()),
            AgoraError::Unauthorized
        );

        job.status = JobStatus::WorkSubmitted;
        Ok(())
    }

    pub fn approve_and_release(ctx: Context<ApproveAndRelease>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        let bid = &ctx.accounts.bid;
        let escrow = &mut ctx.accounts.escrow;

        require!(
            job.status == JobStatus::WorkSubmitted,
            AgoraError::InvalidJobStatus
        );
        require!(!escrow.released, AgoraError::EscrowAlreadyReleased);
        require!(job.accepted_bid == Some(bid.key()), AgoraError::BidJobMismatch);
        require!(job.accepted_agent == Some(bid.agent), AgoraError::BidJobMismatch);
        require!(bid.status == BidStatus::Accepted, AgoraError::InvalidJobStatus);

        let payout = bid.amount;
        let refund = escrow
            .amount
            .checked_sub(payout)
            .ok_or(AgoraError::EscrowInsufficient)?;

        transfer_lamports(
            &escrow.to_account_info(),
            &ctx.accounts.agent.to_account_info(),
            payout,
        )?;

        if refund > 0 {
            transfer_lamports(
                &escrow.to_account_info(),
                &ctx.accounts.client.to_account_info(),
                refund,
            )?;
        }

        escrow.amount = 0;
        escrow.released = true;
        job.status = JobStatus::Completed;

        Ok(())
    }

    pub fn cancel_job_and_refund(ctx: Context<CancelJobAndRefund>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        let escrow = &mut ctx.accounts.escrow;

        require!(job.status == JobStatus::Open, AgoraError::JobNotOpen);
        require!(job.accepted_bid.is_none(), AgoraError::InvalidJobStatus);
        require!(!escrow.released, AgoraError::EscrowAlreadyReleased);

        let refund = escrow.amount;
        if refund > 0 {
            transfer_lamports(
                &escrow.to_account_info(),
                &ctx.accounts.client.to_account_info(),
                refund,
            )?;
        }

        escrow.amount = 0;
        escrow.released = true;
        job.status = JobStatus::Cancelled;

        Ok(())
    }

    pub fn initialize_service_counter(ctx: Context<InitializeServiceCounter>) -> Result<()> {
        let counter = &mut ctx.accounts.service_counter;
        counter.authority = ctx.accounts.agent.key();
        counter.count = 0;
        counter.bump = ctx.bumps.service_counter;
        Ok(())
    }

    pub fn create_service_listing(
        ctx: Context<CreateServiceListing>,
        title: String,
        description: String,
        metadata_uri: String,
        skills: Vec<String>,
        hourly_rate: u64,
        min_budget: u64,
    ) -> Result<()> {
        require!(title.len() <= ServiceListing::MAX_TITLE_LEN, AgoraError::TitleTooLong);
        require!(
            description.len() <= ServiceListing::MAX_DESC_LEN,
            AgoraError::DescriptionTooLong
        );
        require!(
            metadata_uri.len() <= ServiceListing::MAX_URI_LEN,
            AgoraError::UriTooLong
        );
        require!(skills.len() <= ServiceListing::MAX_SKILLS, AgoraError::TooManySkills);
        for skill in &skills {
            require!(
                skill.len() <= ServiceListing::MAX_SKILL_LEN,
                AgoraError::SkillTooLong
            );
        }

        let now = Clock::get()?.unix_timestamp;
        let counter = &mut ctx.accounts.service_counter;
        let listing_id = counter.count;

        let listing = &mut ctx.accounts.service_listing;
        listing.agent = ctx.accounts.agent.key();
        listing.listing_id = listing_id;
        listing.title = title;
        listing.description = description;
        listing.metadata_uri = metadata_uri;
        listing.skills = skills;
        listing.hourly_rate = hourly_rate;
        listing.min_budget = min_budget;
        listing.is_active = true;
        listing.bump = ctx.bumps.service_listing;
        listing.created_at = now;

        counter.count = counter
            .count
            .checked_add(1)
            .ok_or(AgoraError::ArithmeticOverflow)?;

        Ok(())
    }

    pub fn toggle_service_listing(ctx: Context<ToggleServiceListing>) -> Result<()> {
        let listing = &mut ctx.accounts.service_listing;
        listing.is_active = !listing.is_active;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeJobCounter<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(
        init,
        payer = client,
        space = JobCounter::SPACE,
        seeds = [SEED_JOB_COUNTER, client.key().as_ref()],
        bump
    )]
    pub job_counter: Account<'info, JobCounter>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateAgentProfile<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = AgentProfile::SPACE,
        seeds = [SEED_AGENT_PROFILE, authority.key().as_ref()],
        bump
    )]
    pub agent_profile: Account<'info, AgentProfile>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateJob<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_JOB_COUNTER, client.key().as_ref()],
        bump = job_counter.bump,
        constraint = job_counter.authority == client.key() @ AgoraError::Unauthorized,
    )]
    pub job_counter: Account<'info, JobCounter>,
    #[account(
        init,
        payer = client,
        space = Job::SPACE,
        seeds = [SEED_JOB, client.key().as_ref(), &job_counter.count.to_le_bytes()],
        bump
    )]
    pub job: Account<'info, Job>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(
        mut,
        has_one = client @ AgoraError::Unauthorized,
        constraint = job.status == JobStatus::Open @ AgoraError::JobNotOpen,
    )]
    pub job: Account<'info, Job>,
    #[account(
        init,
        payer = client,
        space = Escrow::SPACE,
        seeds = [SEED_ESCROW, job.key().as_ref()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,
    #[account(mut, constraint = job.status == JobStatus::Open @ AgoraError::JobNotOpen)]
    pub job: Account<'info, Job>,
    #[account(
        mut,
        seeds = [SEED_ESCROW, job.key().as_ref()],
        bump = escrow.bump,
        constraint = escrow.job == job.key() @ AgoraError::BidJobMismatch,
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(
        init,
        payer = agent,
        space = Bid::SPACE,
        seeds = [SEED_BID, job.key().as_ref(), agent.key().as_ref()],
        bump
    )]
    pub bid: Account<'info, Bid>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptBid<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(mut, has_one = client @ AgoraError::Unauthorized)]
    pub job: Account<'info, Job>,
    #[account(
        mut,
        constraint = bid.job == job.key() @ AgoraError::BidJobMismatch,
    )]
    pub bid: Account<'info, Bid>,
    #[account(
        mut,
        seeds = [SEED_ESCROW, job.key().as_ref()],
        bump = escrow.bump,
        constraint = escrow.job == job.key() @ AgoraError::BidJobMismatch,
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct SubmitWork<'info> {
    pub agent: Signer<'info>,
    #[account(mut)]
    pub job: Account<'info, Job>,
}

#[derive(Accounts)]
pub struct ApproveAndRelease<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(mut)]
    pub agent: SystemAccount<'info>,
    #[account(mut, has_one = client @ AgoraError::Unauthorized)]
    pub job: Account<'info, Job>,
    #[account(
        constraint = bid.job == job.key() @ AgoraError::BidJobMismatch,
    )]
    pub bid: Account<'info, Bid>,
    #[account(
        mut,
        seeds = [SEED_ESCROW, job.key().as_ref()],
        bump = escrow.bump,
        constraint = escrow.job == job.key() @ AgoraError::BidJobMismatch,
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct CancelJobAndRefund<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(mut, has_one = client @ AgoraError::Unauthorized)]
    pub job: Account<'info, Job>,
    #[account(
        mut,
        seeds = [SEED_ESCROW, job.key().as_ref()],
        bump = escrow.bump,
        constraint = escrow.job == job.key() @ AgoraError::BidJobMismatch,
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct InitializeServiceCounter<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,
    #[account(
        init,
        payer = agent,
        space = ServiceCounter::SPACE,
        seeds = [SEED_SERVICE_COUNTER, agent.key().as_ref()],
        bump
    )]
    pub service_counter: Account<'info, ServiceCounter>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateServiceListing<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,
    #[account(
        mut,
        seeds = [SEED_SERVICE_COUNTER, agent.key().as_ref()],
        bump = service_counter.bump,
        constraint = service_counter.authority == agent.key() @ AgoraError::Unauthorized,
    )]
    pub service_counter: Account<'info, ServiceCounter>,
    #[account(
        init,
        payer = agent,
        space = ServiceListing::SPACE,
        seeds = [SEED_SERVICE, agent.key().as_ref(), &service_counter.count.to_le_bytes()],
        bump
    )]
    pub service_listing: Account<'info, ServiceListing>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ToggleServiceListing<'info> {
    #[account(mut)]
    pub agent: Signer<'info>,
    #[account(
        mut,
        constraint = service_listing.agent == agent.key() @ AgoraError::Unauthorized,
    )]
    pub service_listing: Account<'info, ServiceListing>,
}

fn transfer_lamports(from: &AccountInfo, to: &AccountInfo, amount: u64) -> Result<()> {
    require!(from.lamports() >= amount, AgoraError::EscrowInsufficient);

    let from_new = from
        .lamports()
        .checked_sub(amount)
        .ok_or(AgoraError::ArithmeticOverflow)?;
    let to_new = to
        .lamports()
        .checked_add(amount)
        .ok_or(AgoraError::ArithmeticOverflow)?;

    **from.try_borrow_mut_lamports()? = from_new;
    **to.try_borrow_mut_lamports()? = to_new;

    Ok(())
}

using Microsoft.EntityFrameworkCore;

namespace MigsunSales.Api;

public enum LeadStatus { New, Contacted, Qualified, SiteVisit, Negotiation, Booked, Lost }
public enum LeadSource { Website, Referral, ChannelPartner, WalkIn, Campaign, Phone }

public sealed class DemoUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string FullName { get; set; } = "";
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "Admin";
    public bool IsActive { get; set; } = true;
}

public sealed class Lead
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string FullName { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string ProjectName { get; set; } = "";
    public string PropertyType { get; set; } = "Residential";
    public decimal? BudgetLakhs { get; set; }
    public int? PurchaseTimelineDays { get; set; }
    public LeadSource Source { get; set; }
    public LeadStatus Status { get; set; }
    public string Notes { get; set; } = "";
    public string AssignedTo { get; set; } = "Unassigned";
    public DateTime? NextFollowUpUtc { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}

public sealed class SalesDbContext(DbContextOptions<SalesDbContext> options) : DbContext(options)
{
    public DbSet<DemoUser> Users => Set<DemoUser>();
    public DbSet<Lead> Leads => Set<Lead>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<DemoUser>().HasIndex(x => x.Email).IsUnique();
        modelBuilder.Entity<Lead>().Property(x => x.BudgetLakhs).HasPrecision(12, 2);
        modelBuilder.Entity<Lead>().Property(x => x.Source).HasConversion<string>();
        modelBuilder.Entity<Lead>().Property(x => x.Status).HasConversion<string>();
        modelBuilder.Entity<Lead>().HasIndex(x => x.Status);
        modelBuilder.Entity<Lead>().HasIndex(x => x.NextFollowUpUtc);
    }
}

public static class DemoSeeder
{
    public static async Task SeedLeadsAsync(SalesDbContext db, bool allowFictionalSeedData)
    {
        if (!allowFictionalSeedData) return;
        if (!await db.Leads.AnyAsync())
        {
            var now = DateTime.UtcNow;
            db.Leads.AddRange(
                new Lead { FullName="Aarav Sharma", Email="aarav@example.test", Phone="9000000101", ProjectName="Residential Project", PropertyType="Residential", BudgetLakhs=95, PurchaseTimelineDays=45, Source=LeadSource.Website, Status=LeadStatus.Qualified, Notes="Asked about configuration and site visit.", AssignedTo="Neha Kapoor", NextFollowUpUtc=now.AddDays(1), CreatedAtUtc=now.AddDays(-4), UpdatedAtUtc=now.AddHours(-5) },
                new Lead { FullName="Priya Verma", Email="priya@example.test", Phone="9000000102", ProjectName="Retail Plaza", PropertyType="Commercial", BudgetLakhs=150, PurchaseTimelineDays=20, Source=LeadSource.Referral, Status=LeadStatus.SiteVisit, Notes="Wants to compare unit sizes.", AssignedTo="Rohan Singh", NextFollowUpUtc=now.AddHours(-4), CreatedAtUtc=now.AddDays(-7), UpdatedAtUtc=now.AddHours(-20) },
                new Lead { FullName="Rahul Mehta", Email="rahul@example.test", Phone="9000000103", ProjectName="Residential Project", PropertyType="Residential", BudgetLakhs=75, PurchaseTimelineDays=100, Source=LeadSource.ChannelPartner, Status=LeadStatus.Contacted, Notes="Requested payment-plan overview.", AssignedTo="Neha Kapoor", NextFollowUpUtc=now.AddHours(5), CreatedAtUtc=now.AddDays(-3), UpdatedAtUtc=now.AddHours(-2) },
                new Lead { FullName="Sara Khan", Email="sara@example.test", Phone="9000000104", ProjectName="Commercial Centre", PropertyType="Commercial", BudgetLakhs=220, PurchaseTimelineDays=60, Source=LeadSource.Campaign, Status=LeadStatus.Negotiation, Notes="Follow up after internal discussion.", AssignedTo="Rohan Singh", NextFollowUpUtc=now.AddDays(2), CreatedAtUtc=now.AddDays(-14), UpdatedAtUtc=now.AddHours(-8) },
                new Lead { FullName="Kabir Gupta", Email="kabir@example.test", Phone="9000000105", ProjectName="Residential Project", PropertyType="Residential", BudgetLakhs=65, PurchaseTimelineDays=180, Source=LeadSource.WalkIn, Status=LeadStatus.New, Notes="Initial enquiry; qualification pending.", AssignedTo="Unassigned", NextFollowUpUtc=now.AddDays(-1), CreatedAtUtc=now.AddDays(-1), UpdatedAtUtc=now.AddDays(-1) },
                new Lead { FullName="Meera Joshi", Email="meera@example.test", Phone="9000000106", ProjectName="Retail Plaza", PropertyType="Commercial", BudgetLakhs=180, PurchaseTimelineDays=30, Source=LeadSource.Referral, Status=LeadStatus.Booked, Notes="Booking outcome recorded for analytics.", AssignedTo="Neha Kapoor", CreatedAtUtc=now.AddDays(-20), UpdatedAtUtc=now.AddDays(-2) },
                new Lead { FullName="Dev Malhotra", Email="dev@example.test", Phone="9000000107", ProjectName="Residential Project", PropertyType="Residential", BudgetLakhs=null, PurchaseTimelineDays=null, Source=LeadSource.Phone, Status=LeadStatus.Lost, Notes="Prospect timeline changed.", AssignedTo="Rohan Singh", CreatedAtUtc=now.AddDays(-30), UpdatedAtUtc=now.AddDays(-10) }
            );
        }
        await db.SaveChangesAsync();
    }
}

public static class LeadScoring
{
    public static int Score(Lead l)
    {
        var score = 0;
        if (l.BudgetLakhs.HasValue && l.BudgetLakhs.Value > 0) score += 15;
        if (l.PurchaseTimelineDays is <= 30 and >= 0) score += 25;
        else if (l.PurchaseTimelineDays is <= 90 and >= 0) score += 15;
        else if (l.PurchaseTimelineDays is <= 180 and >= 0) score += 8;
        score += l.Status switch
        {
            LeadStatus.Contacted => 5,
            LeadStatus.Qualified => 10,
            LeadStatus.SiteVisit => 15,
            LeadStatus.Negotiation => 20,
            LeadStatus.Booked => 20,
            _ => 0
        };
        score += l.Source switch
        {
            LeadSource.Referral or LeadSource.ChannelPartner => 10,
            LeadSource.Website => 5,
            _ => 0
        };
        return Math.Min(100, score);
    }

    public static string Priority(int score) => score >= 70 ? "High" : score >= 40 ? "Medium" : "Low";
}

public record LeadDto(Guid Id, string FullName, string Email, string Phone, string ProjectName,
    string PropertyType, decimal? BudgetLakhs, int? PurchaseTimelineDays, string Source, string Status,
    string Notes, string AssignedTo, DateTime? NextFollowUpUtc, DateTime CreatedAtUtc, DateTime UpdatedAtUtc,
    int Score, string Priority)
{
    public static LeadDto From(Lead l)
    {
        var score = LeadScoring.Score(l);
        return new(l.Id, l.FullName, l.Email, l.Phone, l.ProjectName, l.PropertyType, l.BudgetLakhs,
            l.PurchaseTimelineDays, l.Source.ToString(), l.Status.ToString(), l.Notes, l.AssignedTo,
            l.NextFollowUpUtc, l.CreatedAtUtc, l.UpdatedAtUtc, score, LeadScoring.Priority(score));
    }
}

public static class FollowUpCopilot
{
    public static string CreateDraft(Lead lead, string? objective)
    {
        var firstName = lead.FullName.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "there";
        var project = lead.ProjectName;
        var stageContext = lead.Status switch
        {
            LeadStatus.New => "Thank you for your enquiry",
            LeadStatus.Contacted => "I am following up on our conversation",
            LeadStatus.Qualified => "Based on the requirements we discussed",
            LeadStatus.SiteVisit => "Thank you for considering the project after your visit",
            LeadStatus.Negotiation => "I am checking in about the proposal we discussed",
            LeadStatus.Booked => "Thank you for your booking",
            _ => "Thank you for considering the project"
        };

        return objective?.Trim().ToLowerInvariant() switch
        {
            "invite for a site visit" => $"Hello {firstName}, {stageContext} for {project}. Would you like to arrange a site visit at a convenient time? Please let me know whether a weekday or weekend works better.",
            "share project information" => $"Hello {firstName}, {stageContext} for {project}. I can share the project overview and information relevant to your requirements. Is there a particular unit type or feature you would like to know more about?",
            "check in after a visit" => $"Hello {firstName}, thank you for visiting {project}. I wanted to check whether you have any questions about what you saw or would like any additional information before deciding on next steps.",
            "follow up on enquiry" => $"Hello {firstName}, {stageContext} about {project}. Would a brief call help us understand your requirements and answer any initial questions?",
            _ => lead.Status switch
            {
                LeadStatus.New => $"Hello {firstName}, thank you for your interest in {project}. May I learn a little more about your preferred property type and purchase timeline so I can share relevant information?",
                LeadStatus.Contacted => $"Hello {firstName}, I am following up on your enquiry about {project}. Would you prefer a brief call to discuss your requirements and available options?",
                LeadStatus.Qualified => $"Hello {firstName}, based on the requirements we discussed for {project}, would you be available to explore the next steps or arrange a site visit?",
                LeadStatus.SiteVisit => $"Hello {firstName}, thank you for considering {project}. Do you have any questions following the site visit that I can help clarify?",
                LeadStatus.Negotiation => $"Hello {firstName}, I wanted to check whether you need any additional information about the proposal for {project}. I can coordinate a discussion to clarify your questions.",
                LeadStatus.Booked => $"Hello {firstName}, thank you for your booking for {project}. Please let us know if you need help with the next steps or documentation.",
                _ => $"Hello {firstName}, thank you for considering {project}. If your requirements change, I would be happy to help with relevant information."
            }
        };
    }
}

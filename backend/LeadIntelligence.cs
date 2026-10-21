
using MigsunSales.Api;

namespace MigsunSales.Api;

public sealed record LeadIntelligenceResult(
    Guid LeadId,
    string FullName,
    string ProjectName,
    string AssignedTo,
    string Status,
    int Score,
    string Priority,
    decimal? BudgetLakhs,
    int? PurchaseTimelineDays,
    DateTime? NextFollowUpUtc,
    string FollowUpState,
    IReadOnlyList<string> ScoreReasons,
    string RecommendedAction,
    string RecommendationReason);

public static class LeadIntelligence
{
    public static LeadIntelligenceResult Evaluate(Lead lead, DateTime utcNow)
    {
        var score = LeadScoring.Score(lead);
        var priority = LeadScoring.Priority(score);
        var reasons = new List<string>();

        // Explain the existing score formula without changing it.
        if (lead.BudgetLakhs is > 0)
            reasons.Add("Budget provided: +15 points.");

        if (lead.PurchaseTimelineDays is >= 0 and <= 30)
            reasons.Add("Purchase timeline is within 30 days: +25 points.");
        else if (lead.PurchaseTimelineDays is > 30 and <= 90)
            reasons.Add("Purchase timeline is within 31–90 days: +15 points.");
        else if (lead.PurchaseTimelineDays is > 90 and <= 180)
            reasons.Add("Purchase timeline is within 91–180 days: +8 points.");

        var stagePoints = lead.Status switch
        {
            LeadStatus.Contacted => 5,
            LeadStatus.Qualified => 10,
            LeadStatus.SiteVisit => 15,
            LeadStatus.Negotiation => 20,
            LeadStatus.Booked => 20,
            _ => 0
        };

        if (stagePoints > 0)
            reasons.Add($"Pipeline stage {lead.Status}: +{stagePoints} points.");

        var sourcePoints = lead.Source switch
        {
            LeadSource.Referral or LeadSource.ChannelPartner => 10,
            LeadSource.Website => 5,
            _ => 0
        };

        if (sourcePoints > 0)
            reasons.Add($"Lead source {lead.Source}: +{sourcePoints} points.");

        if (reasons.Count == 0)
            reasons.Add("No positive scoring signals were found in the available lead fields.");

        var isClosed = lead.Status is LeadStatus.Booked or LeadStatus.Lost;
        var isOverdue = !isClosed
            && lead.NextFollowUpUtc.HasValue
            && lead.NextFollowUpUtc.Value <= utcNow;

        var followUpState = isClosed
            ? "Not required — lead is closed"
            : !lead.NextFollowUpUtc.HasValue
                ? "Not scheduled"
                : isOverdue
                    ? "Overdue"
                    : lead.NextFollowUpUtc.Value <= utcNow.AddHours(24)
                        ? "Due within 24 hours"
                        : "Scheduled";

        var (action, reason) = RecommendAction(
            lead, utcNow, isOverdue);

        return new LeadIntelligenceResult(
            lead.Id,
            lead.FullName,
            lead.ProjectName,
            lead.AssignedTo,
            lead.Status.ToString(),
            score,
            priority,
            lead.BudgetLakhs,
            lead.PurchaseTimelineDays,
            lead.NextFollowUpUtc,
            followUpState,
            reasons,
            action,
            reason);
    }

    private static (string Action, string Reason) RecommendAction(
        Lead lead,
        DateTime utcNow,
        bool isOverdue)
    {
        if (lead.Status is LeadStatus.Booked or LeadStatus.Lost)
        {
            return (
                "Review closed-lead outcome",
                lead.Status == LeadStatus.Booked
                    ? "The lead is booked. Confirm the recorded outcome and any remaining handover tasks."
                    : "The lead is marked lost. Review the recorded reason before considering any future re-engagement.");
        }

        if (isOverdue)
        {
            return (
                "Complete overdue follow-up",
                $"The scheduled follow-up was due at {lead.NextFollowUpUtc:dd MMM yyyy HH:mm} UTC. Review the conversation and record the next step.");
        }

        if (!lead.NextFollowUpUtc.HasValue)
        {
            return (
                "Schedule the next follow-up",
                "No follow-up date is recorded. Assign a clear next step and schedule a contact time.");
        }

        if (lead.PurchaseTimelineDays is >= 0 and <= 30)
        {
            return (
                "Contact promptly and confirm buying requirements",
                "The recorded purchase timeline is within 30 days. Confirm requirements, budget, decision-makers, and the next agreed action.");
        }

        return lead.Status switch
        {
            LeadStatus.New => (
                "Qualify the enquiry",
                "Confirm property preferences, budget, purchase timeline, and the prospect's preferred contact method."),

            LeadStatus.Contacted => (
                "Complete lead qualification",
                "Confirm purchase intent, requirements, timeline, and whether the prospect is ready for a detailed discussion."),

            LeadStatus.Qualified => (
                "Propose a suitable site visit",
                "The lead is qualified. Confirm availability and agree on a suitable site-visit time."),

            LeadStatus.SiteVisit => (
                "Follow up on the site visit",
                "Ask for feedback, address outstanding questions, and agree on the next step."),

            LeadStatus.Negotiation => (
                "Resolve outstanding decision points",
                "Review open questions and coordinate the next discussion. Verify all pricing and availability details before communicating them."),

            _ => (
                "Review lead and confirm next step",
                "Review the recorded information and agree on a specific next action with the prospect.")
        };
    }
}

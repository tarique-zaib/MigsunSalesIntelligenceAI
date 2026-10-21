using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using MigsunSales.Api;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<SalesDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("SalesDatabase")));

var jwtSecret = builder.Configuration["Jwt:Secret"] ?? "";
if (jwtSecret.Length < 64)
    throw new InvalidOperationException("Jwt:Secret must be at least 64 characters. Set it using the Jwt__Secret environment variable or a local user-secrets store.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "MigsunSalesWorkspace",
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "MigsunSalesFrontend",
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("LeadRead", p => p.RequireRole("Admin", "SalesManager", "SalesExecutive", "ReadOnlyAnalyst"));
    options.AddPolicy("LeadWrite", p => p.RequireRole("Admin", "SalesManager", "SalesExecutive"));
    options.AddPolicy("LeadManage", p => p.RequireRole("Admin", "SalesManager"));
    options.AddPolicy("AdminOnly", p => p.RequireRole("Admin"));
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("login", limiter =>
    {
        limiter.PermitLimit = 8;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
        limiter.AutoReplenishment = true;
    });
});
builder.Services.AddCors(options => options.AddPolicy("frontend", policy =>
    policy.WithOrigins(builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? ["http://localhost:5173"])
          .AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddEndpointsApiExplorer();

var app = builder.Build();

app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
{
    var feature = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
    var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("GlobalExceptionHandler");
    if (feature?.Error is not null) logger.LogError(feature.Error, "Unhandled request exception. TraceId: {TraceId}", context.TraceIdentifier);
    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
    context.Response.ContentType = "application/problem+json";
    await context.Response.WriteAsJsonAsync(new Microsoft.AspNetCore.Mvc.ProblemDetails
    {
        Status = StatusCodes.Status500InternalServerError,
        Title = "An unexpected error occurred.",
        Detail = "The request could not be completed. Use the trace ID when contacting support.",
        Extensions = { ["traceId"] = context.TraceIdentifier }
    });
}));
app.UseRateLimiter();
app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<SalesDbContext>();
    var environment = scope.ServiceProvider.GetRequiredService<IWebHostEnvironment>();
    if (environment.IsDevelopment())
        await db.Database.EnsureCreatedAsync();
    else
        await db.Database.MigrateAsync();

    await DemoSeeder.SeedLeadsAsync(db, environment.IsDevelopment());

    // Bootstrap the first administrator only when explicit credentials are supplied via environment variables.
    var bootstrapEmail = builder.Configuration["BootstrapAdmin:Email"]?.Trim().ToLowerInvariant();
    var bootstrapPassword = builder.Configuration["BootstrapAdmin:Password"];
    var bootstrapName = builder.Configuration["BootstrapAdmin:FullName"] ?? "System Administrator";
    if (!string.IsNullOrWhiteSpace(bootstrapEmail) && !string.IsNullOrWhiteSpace(bootstrapPassword))
    {
        if (bootstrapPassword.Length < 14 || !bootstrapPassword.Any(char.IsUpper) || !bootstrapPassword.Any(char.IsLower) || !bootstrapPassword.Any(char.IsDigit) || !bootstrapPassword.Any(c => !char.IsLetterOrDigit(c)))
            throw new InvalidOperationException("Bootstrap admin password must be at least 14 characters and include upper/lowercase letters, a number, and a symbol.");
        if (!await db.Users.AnyAsync(u => u.Email == bootstrapEmail))
        {
            db.Users.Add(new DemoUser { FullName = bootstrapName, Email = bootstrapEmail, PasswordHash = PasswordHasher.Hash(bootstrapPassword), Role = "Admin" });
            await db.SaveChangesAsync();
        }
    }

    // Clean up earlier display labels in existing local databases without deleting records.
    await db.Leads.Where(l => l.ProjectName == "Demo Residential Project")
        .ExecuteUpdateAsync(setters => setters.SetProperty(l => l.ProjectName, "Residential Project"));
    await db.Leads.Where(l => l.ProjectName == "Demo Retail Plaza")
        .ExecuteUpdateAsync(setters => setters.SetProperty(l => l.ProjectName, "Retail Plaza"));
    await db.Leads.Where(l => l.ProjectName == "Demo Commercial Centre")
        .ExecuteUpdateAsync(setters => setters.SetProperty(l => l.ProjectName, "Commercial Centre"));
}

app.MapGet("/health", async (SalesDbContext db) =>
{
    try
    {
        var canConnect = await db.Database.CanConnectAsync();
        if (canConnect)
            return (IResult)Results.Ok(new { status = "Healthy", database = "Connected", application = "Migsun Sales Intelligence AI", disclaimer = "Independent fictional-data prototype" });
        return Results.Json(new { status = "Degraded", database = "Unavailable", application = "Migsun Sales Intelligence AI" }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    catch
    {
        return (IResult)Results.Json(new { status = "Degraded", database = "Unavailable", application = "Migsun Sales Intelligence AI" }, statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.MapPost("/api/auth/login", async (LoginRequest request, SalesDbContext db, IConfiguration config) =>
{
    if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password) || request.Email.Length > 254 || request.Password.Length > 1024)
        return Results.BadRequest(new { message = "Email and password are required." });
    var email = request.Email.Trim().ToLowerInvariant();
    var user = await db.Users.SingleOrDefaultAsync(u => u.Email == email && u.IsActive);
    if (user is null || !PasswordHasher.Verify(request.Password, user.PasswordHash))
        return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Invalid email or password.");

    var secret = Encoding.UTF8.GetBytes(config["Jwt:Secret"]!);
    var claims = new[]
    {
        new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
        new Claim(ClaimTypes.Name, user.FullName),
        new Claim(ClaimTypes.Email, user.Email),
        new Claim(ClaimTypes.Role, user.Role)
    };
    var token = new JwtSecurityToken(
        issuer: config["Jwt:Issuer"] ?? "MigsunSalesWorkspace",
        audience: config["Jwt:Audience"] ?? "MigsunSalesFrontend",
        claims: claims,
        expires: DateTime.UtcNow.AddHours(4),
        signingCredentials: new SigningCredentials(new SymmetricSecurityKey(secret), SecurityAlgorithms.HmacSha256));
    return Results.Ok(new LoginResponse(new JwtSecurityTokenHandler().WriteToken(token), user.FullName, user.Email, user.Role));
}).RequireRateLimiting("login");

app.MapGet("/api/auth/me", (ClaimsPrincipal principal) =>
    Results.Ok(new { name = principal.Identity?.Name, email = principal.FindFirstValue(ClaimTypes.Email), role = principal.FindFirstValue(ClaimTypes.Role) }))
    .RequireAuthorization();

app.MapGet("/api/dashboard", async (SalesDbContext db) =>
{
    var leads = await db.Leads.AsNoTracking().ToListAsync();
    var now = DateTime.UtcNow;
    return Results.Ok(new
    {
        totalLeads = leads.Count,
        highPriority = leads.Count(l => LeadScoring.Score(l) >= 70),
        siteVisitsThisWeek = leads.Count(l => l.Status == LeadStatus.SiteVisit && l.UpdatedAtUtc >= now.AddDays(-7)),
        bookingsThisMonth = leads.Count(l => l.Status == LeadStatus.Booked && l.UpdatedAtUtc.Month == now.Month && l.UpdatedAtUtc.Year == now.Year),
        overdueFollowUps = leads.Count(l => l.NextFollowUpUtc.HasValue && l.NextFollowUpUtc.Value < now && l.Status != LeadStatus.Booked && l.Status != LeadStatus.Lost),
        fictionalData = true
    });
}).RequireAuthorization("LeadRead");

app.MapGet("/api/leads", async (string? search, SalesDbContext db) =>
{
    var query = db.Leads.AsNoTracking().AsQueryable();
    if (!string.IsNullOrWhiteSpace(search))
    {
        var term = search.Trim().ToLower();
        query = query.Where(l => l.FullName.ToLower().Contains(term) ||
                                 l.Email.ToLower().Contains(term) ||
                                 l.ProjectName.ToLower().Contains(term) ||
                                 l.Phone.Contains(term));
    }
    var leads = await query.OrderByDescending(l => l.UpdatedAtUtc).ToListAsync();
    return Results.Ok(leads.Select(LeadDto.From));
}).RequireAuthorization("LeadRead");


app.MapGet("/api/intelligence/leads", async (
    string? priority,
    string? followUpState,
    int? limit,
    SalesDbContext db) =>
{
    var leads = await db.Leads
        .AsNoTracking()
        .ToListAsync();

    var now = DateTime.UtcNow;

    var results = leads
        .Select(lead => LeadIntelligence.Evaluate(lead, now))
        .AsEnumerable();

    if (!string.IsNullOrWhiteSpace(priority))
    {
        var normalizedPriority = priority.Trim();

        if (!new[] { "High", "Medium", "Low" }
            .Contains(normalizedPriority, StringComparer.OrdinalIgnoreCase))
        {
            return Results.BadRequest(new
            {
                message = "Priority must be High, Medium, or Low."
            });
        }

        results = results.Where(x =>
            string.Equals(
                x.Priority,
                normalizedPriority,
                StringComparison.OrdinalIgnoreCase));
    }

    if (!string.IsNullOrWhiteSpace(followUpState))
    {
        var normalizedState = followUpState.Trim();

        var allowedStates = new[]
        {
            "Overdue",
            "Due within 24 hours",
            "Scheduled",
            "Not scheduled",
            "Not required — lead is closed"
        };

        if (!allowedStates.Contains(normalizedState, StringComparer.OrdinalIgnoreCase))
        {
            return Results.BadRequest(new
            {
                message = "Unsupported follow-up state."
            });
        }

        results = results.Where(x =>
            string.Equals(
                x.FollowUpState,
                normalizedState,
                StringComparison.OrdinalIgnoreCase));
    }

    var take = Math.Clamp(limit ?? 100, 1, 200);

    var ranked = results
        .OrderByDescending(x => x.FollowUpState == "Overdue")
        .ThenByDescending(x => x.Score)
        .ThenBy(x => x.NextFollowUpUtc ?? DateTime.MaxValue)
        .Take(take)
        .ToArray();

    return Results.Ok(new
    {
        generatedAtUtc = now,
        scoringMethod = "Existing deterministic LeadScoring formula",
        fictionalData = true,
        totalReturned = ranked.Length,
        leads = ranked
    });
})
.RequireAuthorization("LeadRead");


app.MapGet("/api/leads/{id:guid}", async (Guid id, SalesDbContext db) =>
{
    var lead = await db.Leads.AsNoTracking().FirstOrDefaultAsync(l => l.Id == id);
    return lead is null ? Results.NotFound() : Results.Ok(LeadDto.From(lead));
}).RequireAuthorization("LeadRead");

app.MapPost("/api/leads", async (CreateLeadRequest request, SalesDbContext db) =>
{
    if (string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(request.Email) ||
        string.IsNullOrWhiteSpace(request.Phone) || string.IsNullOrWhiteSpace(request.ProjectName))
        return Results.BadRequest(new { message = "Name, email, phone, and project are required." });
    if (!Enum.TryParse<LeadSource>(request.Source, true, out var source) ||
        !Enum.TryParse<LeadStatus>(request.Status, true, out var status))
        return Results.BadRequest(new { message = "Invalid source or status." });

    var lead = new Lead
    {
        FullName = request.FullName.Trim(),
        Email = request.Email.Trim().ToLowerInvariant(),
        Phone = request.Phone.Trim(),
        ProjectName = request.ProjectName.Trim(),
        PropertyType = string.IsNullOrWhiteSpace(request.PropertyType) ? "Residential" : request.PropertyType.Trim(),
        BudgetLakhs = request.BudgetLakhs,
        PurchaseTimelineDays = request.PurchaseTimelineDays,
        Source = source,
        Status = status,
        Notes = request.Notes?.Trim() ?? "",
        AssignedTo = string.IsNullOrWhiteSpace(request.AssignedTo) ? "Unassigned" : request.AssignedTo.Trim(),
        NextFollowUpUtc = request.NextFollowUpUtc,
        CreatedAtUtc = DateTime.UtcNow,
        UpdatedAtUtc = DateTime.UtcNow
    };
    db.Leads.Add(lead);
    await db.SaveChangesAsync();
    return Results.Created($"/api/leads/{lead.Id}", LeadDto.From(lead));
}).RequireAuthorization("LeadWrite");

app.MapPut("/api/leads/{id:guid}", async (Guid id, UpdateLeadRequest request, SalesDbContext db) =>
{
    var lead = await db.Leads.FirstOrDefaultAsync(l => l.Id == id);
    if (lead is null) return Results.NotFound();
    if (!Enum.TryParse<LeadStatus>(request.Status, true, out var status))
        return Results.BadRequest(new { message = "Invalid status." });

    lead.Status = status;
    lead.AssignedTo = string.IsNullOrWhiteSpace(request.AssignedTo) ? lead.AssignedTo : request.AssignedTo.Trim();
    lead.Notes = request.Notes?.Trim() ?? lead.Notes;
    lead.NextFollowUpUtc = request.NextFollowUpUtc;
    lead.UpdatedAtUtc = DateTime.UtcNow;
    await db.SaveChangesAsync();
    return Results.Ok(LeadDto.From(lead));
}).RequireAuthorization("LeadWrite");

app.MapGet("/api/leads/{id:guid}/follow-up-draft", async (Guid id, string? objective, SalesDbContext db) =>
{
    var lead = await db.Leads.AsNoTracking().FirstOrDefaultAsync(l => l.Id == id);
    if (lead is null) return Results.NotFound();
    var allowedObjectives = new[] { "Invite for a site visit", "Share project information", "Check in after a visit", "Follow up on enquiry" };
    if (!string.IsNullOrWhiteSpace(objective) && !allowedObjectives.Contains(objective, StringComparer.OrdinalIgnoreCase))
        return Results.BadRequest(new { message = "Unsupported follow-up objective." });
    var draft = FollowUpCopilot.CreateDraft(lead, objective);
    return Results.Ok(new { leadId = lead.Id, objective = objective ?? "Based on lead stage", draft, generatedBy = "Deterministic rule-based copilot", requiresHumanReview = true, fictionalData = true });
}).RequireAuthorization("LeadRead");

app.MapGet("/api/analytics", async (SalesDbContext db) =>
{
    var leads = await db.Leads.AsNoTracking().ToListAsync();
    var stages = Enum.GetValues<LeadStatus>().Select(s => new { stage = s.ToString(), count = leads.Count(l => l.Status == s) }).ToArray();
    var sources = Enum.GetValues<LeadSource>().Select(s => new { source = s.ToString(), count = leads.Count(l => l.Source == s) }).ToArray();
    var sourcePerformance = sources.Select(source =>
    {
        var sourceLeads = leads.Where(l => l.Source.ToString() == source.source).ToArray();
        var sourceBooked = sourceLeads.Count(l => l.Status == LeadStatus.Booked);
        return new
        {
            source = source.source,
            leads = sourceLeads.Length,
            booked = sourceBooked,
            conversionPercent = sourceLeads.Length == 0 ? 0 : Math.Round(sourceBooked * 100.0 / sourceLeads.Length, 1)
        };
    }).ToArray();
    var total = leads.Count;
    var booked = leads.Count(l => l.Status == LeadStatus.Booked);
    var now = DateTime.UtcNow;
    var overdue = leads.Where(l => l.NextFollowUpUtc.HasValue && l.NextFollowUpUtc.Value < now && l.Status != LeadStatus.Booked && l.Status != LeadStatus.Lost)
        .Select(l => new { l.Id, l.FullName, l.ProjectName, l.AssignedTo, nextFollowUpUtc = l.NextFollowUpUtc, status = l.Status.ToString(), score = LeadScoring.Score(l) })
        .OrderByDescending(l => l.score).ToArray();
    return Results.Ok(new { totalLeads = total, booked, conversionPercent = total == 0 ? 0 : Math.Round(booked * 100.0 / total, 1), stages, sources, sourcePerformance, overdueFollowUps = overdue, fictionalData = true });
}).RequireAuthorization("LeadRead");

app.MapGet("/api/admin/users", async (SalesDbContext db) =>
    Results.Ok(await db.Users.AsNoTracking().OrderBy(u => u.Email).Select(u => new { u.Id, u.FullName, u.Email, u.Role, u.IsActive }).ToListAsync()))
    .RequireAuthorization("AdminOnly");

app.MapPost("/api/admin/users", async (CreateUserRequest request, SalesDbContext db) =>
{
    var email = request.Email?.Trim().ToLowerInvariant();
    var name = request.FullName?.Trim();
    var role = request.Role?.Trim();
    var allowedRoles = new[] { "Admin", "SalesManager", "SalesExecutive", "ReadOnlyAnalyst" };
    if (string.IsNullOrWhiteSpace(email) || email.Length > 254 || !System.Net.Mail.MailAddress.TryCreate(email, out _) ||
        string.IsNullOrWhiteSpace(name) || name.Length > 120 || string.IsNullOrEmpty(request.Password) || request.Password.Length < 14 ||
        !request.Password.Any(char.IsUpper) || !request.Password.Any(char.IsLower) || !request.Password.Any(char.IsDigit) || !request.Password.Any(c => !char.IsLetterOrDigit(c)) ||
        role is null || !allowedRoles.Contains(role, StringComparer.Ordinal))
        return Results.BadRequest(new { message = "Provide a valid name, email, strong password (14+ characters with upper/lowercase, number and symbol), and supported role." });
    if (await db.Users.AnyAsync(u => u.Email == email)) return Results.Conflict(new { message = "An account with this email already exists." });
    var user = new DemoUser { FullName = name, Email = email, PasswordHash = PasswordHasher.Hash(request.Password), Role = role, IsActive = true };
    db.Users.Add(user);
    await db.SaveChangesAsync();
    return Results.Created($"/api/admin/users/{user.Id}", new { user.Id, user.FullName, user.Email, user.Role, user.IsActive });
}).RequireAuthorization("AdminOnly");


app.MapPatch("/api/admin/users/{id:guid}/active", async (
    Guid id,
    SetUserActiveRequest request,
    SalesDbContext db,
    ClaimsPrincipal principal) =>
{
    var user = await db.Users.FirstOrDefaultAsync(u => u.Id == id);

    if (user is null)
        return Results.NotFound(new
        {
            message = "User account not found."
        });

    var currentUserId =
        principal.FindFirstValue(ClaimTypes.NameIdentifier);

    if (!request.IsActive &&
        currentUserId == user.Id.ToString())
    {
        return Results.BadRequest(new
        {
            message = "You cannot deactivate your own account."
        });
    }

    if (!request.IsActive &&
        user.Role == "Admin" &&
        user.IsActive)
    {
        var activeAdminCount = await db.Users.CountAsync(
            u => u.Role == "Admin" && u.IsActive);

        if (activeAdminCount <= 1)
        {
            return Results.Conflict(new
            {
                message =
                    "The last active administrator cannot be deactivated. Activate another administrator first."
            });
        }
    }

    user.IsActive = request.IsActive;
    await db.SaveChangesAsync();

    return Results.Ok(new
    {
        user.Id,
        user.FullName,
        user.Email,
        user.Role,
        user.IsActive
    });
})
.RequireAuthorization("AdminOnly");

app.MapGet("/api/intelligence/leads/{id:guid}/reviews", async (
    Guid id,
    SalesDbContext db) =>
{
    var leadExists = await db.Leads.AsNoTracking().AnyAsync(l => l.Id == id);
    if (!leadExists)
        return Results.NotFound(new { message = "Lead not found." });

    var reviews = await db.RecommendationReviews
        .AsNoTracking()
        .Where(r => r.LeadId == id)
        .OrderByDescending(r => r.ReviewedAtUtc)
        .Select(r => new
        {
            r.Id,
            r.LeadId,
            r.RecommendationKey,
            r.RecommendationText,
            r.ReviewerUserId,
            r.ReviewerName,
            r.ReviewerEmail,
            r.ReviewedAtUtc
        })
        .ToListAsync();

    return Results.Ok(reviews);
})
.RequireAuthorization("LeadRead");

app.MapPost("/api/intelligence/leads/{id:guid}/reviews", async (
    Guid id,
    CreateRecommendationReviewRequest request,
    SalesDbContext db,
    ClaimsPrincipal principal) =>
{
    var lead = await db.Leads.AsNoTracking().FirstOrDefaultAsync(l => l.Id == id);
    if (lead is null)
        return Results.NotFound(new { message = "Lead not found." });

    var key = request.RecommendationKey?.Trim();
    var text = request.RecommendationText?.Trim();
    if (string.IsNullOrWhiteSpace(key) || key.Length > 120 ||
        string.IsNullOrWhiteSpace(text) || text.Length > 1000)
    {
        return Results.BadRequest(new
        {
            message = "Recommendation key is required (max 120 characters) and recommendation text is required (max 1000 characters)."
        });
    }

    var reviewerIdValue = principal.FindFirstValue(ClaimTypes.NameIdentifier);
    if (!Guid.TryParse(reviewerIdValue, out var reviewerId))
        return Results.Unauthorized();

    var reviewerName = principal.Identity?.Name?.Trim();
    var reviewerEmail = principal.FindFirstValue(ClaimTypes.Email)?.Trim();
    if (string.IsNullOrWhiteSpace(reviewerName) || string.IsNullOrWhiteSpace(reviewerEmail))
        return Results.Unauthorized();

    var review = new RecommendationReview
    {
        LeadId = id,
        RecommendationKey = key,
        RecommendationText = text,
        ReviewerUserId = reviewerId,
        ReviewerName = reviewerName,
        ReviewerEmail = reviewerEmail,
        ReviewedAtUtc = DateTime.UtcNow
    };

    db.RecommendationReviews.Add(review);
    await db.SaveChangesAsync();

    return Results.Created(
        $"/api/intelligence/leads/{id}/reviews/{review.Id}",
        new
        {
            review.Id,
            review.LeadId,
            review.RecommendationKey,
            review.RecommendationText,
            review.ReviewerUserId,
            review.ReviewerName,
            review.ReviewerEmail,
            review.ReviewedAtUtc
        });
})
.RequireAuthorization("LeadWrite");


app.Run();

public record LoginRequest(string Email, string Password);
public record LoginResponse(string Token, string Name, string Email, string Role);
public record CreateLeadRequest(string FullName, string Email, string Phone, string ProjectName,
    string? PropertyType, decimal? BudgetLakhs, int? PurchaseTimelineDays, string Source, string Status,
    string? Notes, string? AssignedTo, DateTime? NextFollowUpUtc);
public record UpdateLeadRequest(string Status, string? AssignedTo, string? Notes, DateTime? NextFollowUpUtc);
public record CreateUserRequest(string? FullName, string? Email, string? Password, string? Role);
public record SetUserActiveRequest(bool IsActive);
public record CreateRecommendationReviewRequest(string? RecommendationKey, string? RecommendationText);

public static class PasswordHasher
{
    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, 150_000, HashAlgorithmName.SHA256, 32);
        return $"pbkdf2-sha256.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }
    public static bool Verify(string password, string encoded)
    {
        var parts = encoded.Split('.');
        if (parts.Length != 3 || parts[0] != "pbkdf2-sha256") return false;
        try
        {
            var salt = Convert.FromBase64String(parts[1]);
            var expected = Convert.FromBase64String(parts[2]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, 150_000, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch { return false; }
    }
}

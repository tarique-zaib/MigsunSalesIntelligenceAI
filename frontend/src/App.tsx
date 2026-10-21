import { useCallback, useEffect, useMemo, useState } from "react";
import UserManagement from "./UserManagement";
import {
  Activity,
  BrainCircuit,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  Filter,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import {
  api,
  type Analytics,
  type Dashboard,
  type Lead,
  type LeadIntelligence,
  type LeadIntelligenceResponse,
  type NewLead,
} from "./api";

const statuses = [
  "New",
  "Contacted",
  "Qualified",
  "SiteVisit",
  "Negotiation",
  "Booked",
  "Lost",
];
const sources = [
  "Website",
  "Referral",
  "ChannelPartner",
  "WalkIn",
  "Campaign",
  "Phone",
];

type Page =
  | "Overview"
  | "Leads"
  | "Pipeline"
  | "AI Copilot"
  | "Analytics"
  | "Sales Intelligence"
  | "User Management";
type User = { name: string; email: string; role: string };

type RecommendationReview = {
  id: string;
  leadId: string;
  recommendationKey: string;
  recommendationText: string;
  reviewerUserId: string;
  reviewerName: string;
  reviewerEmail: string;
  reviewedAtUtc: string;
};

function money(value: number | null) {
  return value == null ? "Not specified" : `₹${value.toLocaleString("en-IN")}L`;
}
function displayStatus(status: string) {
  return status === "SiteVisit" ? "Site Visit" : status;
}
function dateLabel(value: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function App() {
  const [token, setToken] = useState(
    () =>
      sessionStorage.getItem("migsun_session_token") ||
      sessionStorage.getItem("migsun_demo_token") ||
      "",
  );
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPage] = useState<Page>("Overview");
  useEffect(() => {
    if (authReady && page === "User Management" && user?.role !== "Admin") {
      setPage("Overview");
    }
  }, [authReady, page, user]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [intelligence, setIntelligence] = useState<LeadIntelligence[]>([]);
  const [recommendationReviews, setRecommendationReviews] = useState<
    Record<string, RecommendationReview[]>
  >({});
  const [reviewSavingIds, setReviewSavingIds] = useState<string[]>([]);
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligenceError, setIntelligenceError] = useState("");
  const [intelligencePriority, setIntelligencePriority] = useState("All");
  const [intelligenceFollowUp, setIntelligenceFollowUp] = useState("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);

  const loadIntelligence = useCallback(
    async (auth: string) => {
      setIntelligenceLoading(true);
      setIntelligenceError("");
      try {
        const params = new URLSearchParams({ limit: "200" });
        if (intelligencePriority !== "All")
          params.set("priority", intelligencePriority);
        if (intelligenceFollowUp !== "All")
          params.set("followUpState", intelligenceFollowUp);
        const result = await api<LeadIntelligenceResponse>(
          `/api/intelligence/leads?${params.toString()}`,
          auth,
        );
        setIntelligence(result.leads);
      } catch (e) {
        setIntelligenceError(
          e instanceof Error ? e.message : "Could not load sales intelligence",
        );
      } finally {
        setIntelligenceLoading(false);
      }
    },
    [intelligencePriority, intelligenceFollowUp],
  );

  const loadRecommendationReviews = useCallback(
    async (auth: string, leadIds: string[]) => {
      const entries = await Promise.all(
        leadIds.map(async (leadId) => {
          try {
            const reviews = await api<RecommendationReview[]>(
              `/api/intelligence/leads/${leadId}/reviews`,
              auth,
            );
            return [leadId, reviews] as const;
          } catch {
            // A history lookup must not prevent the intelligence cards from loading.
            return [leadId, [] as RecommendationReview[]] as const;
          }
        }),
      );
      setRecommendationReviews((current) => {
        const next = { ...current };
        for (const [leadId, reviews] of entries) next[leadId] = reviews;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (token && page === "Sales Intelligence" && intelligence.length > 0) {
      void loadRecommendationReviews(
        token,
        intelligence.map((lead) => lead.leadId),
      );
    }
  }, [token, page, intelligence, loadRecommendationReviews]);

  useEffect(() => {
    if (token && page === "Sales Intelligence") void loadIntelligence(token);
  }, [token, page, loadIntelligence]);
  const [mobileNav, setMobileNav] = useState(false);

  const selectedLead = leads.find((l) => l.id === selectedId) || null;
  const loadData = useCallback(async (auth: string) => {
    setLoading(true);
    setError("");
    try {
      const [d, l, a] = await Promise.all([
        api<Dashboard>("/api/dashboard", auth),
        api<Lead[]>("/api/leads", auth),
        api<Analytics>("/api/analytics", auth),
      ]);
      setDashboard(d);
      setLeads(l);
      setAnalytics(a);
      setSelectedId((current) =>
        current && l.some((x) => x.id === current) ? current : l[0]?.id || null,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to load data";
      setError(message);
      if (message.includes("Session expired")) signOut();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!token) {
        setUser(null);
        setAuthReady(true);
        return;
      }

      setAuthReady(false);

      try {
        const currentUser = await api<User>("/api/auth/me", token);

        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        if (!cancelled) {
          sessionStorage.removeItem("migsun_session_token");
          sessionStorage.removeItem("migsun_demo_token");
          setToken("");
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (token) {
      void loadData(token);
    }
  }, [token, loadData]);
  const signOut = () => {
    sessionStorage.removeItem("migsun_session_token");
    sessionStorage.removeItem("migsun_demo_token");
    setToken("");
    setUser(null);
    setDashboard(null);
    setLeads([]);
  };
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };

  const filteredLeads = useMemo(
    () =>
      leads.filter((l) => {
        const q = search.toLowerCase();
        const matches =
          !q ||
          [l.fullName, l.email, l.projectName, l.assignedTo, l.phone].some(
            (v) => v.toLowerCase().includes(q),
          );
        return matches && (statusFilter === "All" || l.status === statusFilter);
      }),
    [leads, search, statusFilter],
  );

  async function login(email: string, password: string) {
    setLoading(true);
    setError("");
    try {
      const result = await api<{
        token: string;
        name: string;
        email: string;
        role: string;
      }>("/api/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      sessionStorage.setItem("migsun_session_token", result.token);
      sessionStorage.removeItem("migsun_demo_token");
      setUser({ name: result.name, email: result.email, role: result.role });
      setToken(result.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function createLead(form: NewLead) {
    try {
      const created = await api<Lead>("/api/leads", token, {
        method: "POST",
        body: JSON.stringify(form),
      });
      await loadData(token);
      setSelectedId(created.id);
      setPage("Leads");
      setShowLeadForm(false);
      notify("Lead created successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create lead");
    }
  }

  async function updateLead(
    lead: Lead,
    patch: { status?: string; assignedTo?: string; notes?: string },
  ) {
    try {
      const updated = await api<Lead>(`/api/leads/${lead.id}`, token, {
        method: "PUT",
        body: JSON.stringify({
          status: patch.status || lead.status,
          assignedTo: patch.assignedTo || lead.assignedTo,
          notes: patch.notes ?? lead.notes,
          nextFollowUpUtc: lead.nextFollowUpUtc,
        }),
      });
      setLeads((old) => old.map((l) => (l.id === updated.id ? updated : l)));
      await loadData(token);
      notify("Lead updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update lead");
    }
  }

  async function generateDraft(lead: Lead, objective?: string) {
    setDraftLoading(true);
    setDraft("");
    try {
      const query = objective
        ? `?objective=${encodeURIComponent(objective)}`
        : "";
      const result = await api<{ draft: string }>(
        `/api/leads/${lead.id}/follow-up-draft${query}`,
        token,
      );
      setDraft(result.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create draft");
    } finally {
      setDraftLoading(false);
    }
  }

  async function reviewRecommendation(lead: LeadIntelligence) {
    if (reviewSavingIds.includes(lead.leadId)) return;

    setReviewSavingIds((ids) => [...ids, lead.leadId]);
    setError("");
    try {
      await api<RecommendationReview>(
        `/api/intelligence/leads/${lead.leadId}/reviews`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            recommendationKey: "recommended-action-v1",
            recommendationText: `${lead.recommendedAction} — ${lead.recommendationReason}`,
          }),
        },
      );
      await loadRecommendationReviews(token, [lead.leadId]);
      setExpandedReviewId(lead.leadId);
      notify(`Recommendation review saved for ${lead.fullName}.`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save recommendation review",
      );
    } finally {
      setReviewSavingIds((ids) => ids.filter((id) => id !== lead.leadId));
    }
  }

  if (!token) return <Login onLogin={login} loading={loading} error={error} />;

  const nav: { name: Page; icon: typeof LayoutDashboard }[] = [
    { name: "Overview", icon: LayoutDashboard },
    { name: "Leads", icon: Users },
    { name: "Pipeline", icon: Target },
    { name: "AI Copilot", icon: Sparkles },
    { name: "Analytics", icon: Activity },
    { name: "Sales Intelligence", icon: BrainCircuit },
    ...(user?.role === "Admin"
      ? [{ name: "User Management" as Page, icon: ShieldCheck }]
      : []),
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-logo-wrap">
            <img
              src="/migsun-logo.png"
              alt="Migsun — Dream It Live It"
              className="brand-logo"
            />
          </div>
          <button
            className="icon-btn close-nav"
            onClick={() => setMobileNav(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace">
          <div className="workspace-icon">
            <Building2 size={17} />
          </div>
          <div>
            <strong>Sales Portfolio</strong>
            <span>Property projects</span>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${page === item.name ? "active" : ""}`}
              onClick={() => {
                setPage(item.name);
                setMobileNav(false);
              }}
            >
              <item.icon size={18} />
              <span>{item.name}</span>
              {item.name === "Leads" && (
                <span className="nav-count">{leads.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <CircleHelp size={19} />
            <div>
              <strong>Sales workspace</strong>
              <span>Sales workspace</span>
            </div>
          </div>
          <div className="user-card">
            <div className="avatar">DA</div>
            <div className="user-info">
              <strong>{user?.name || "Sales Administrator"}</strong>
              <span>{user?.role || "Admin"}</span>
            </div>
            <button
              className="icon-btn"
              onClick={signOut}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Close menu"
        />
      )}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobileNav(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              Workspace <span>/</span> <strong>{page}</strong>
            </div>
          </div>
          <div className="topbar-right">
            <span className="environment-pill">
              <span /> Local workspace
            </span>
            <button
              className="icon-btn"
              title="Notifications"
              onClick={() => notify("No new notifications.")}
            >
              <Bell size={19} />
            </button>
            <div className="top-avatar">DA</div>
          </div>
        </header>
        {error && (
          <div className="error-banner">
            <AlertCircle size={17} />
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="page-content">
          {loading && !dashboard ? (
            <div className="loading">
              <span className="spinner" /> Connecting to local API…
            </div>
          ) : (
            <>
              {page === "Overview" && (
                <Overview
                  dashboard={dashboard}
                  leads={leads}
                  onNavigate={setPage}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setPage("Leads");
                  }}
                />
              )}
              {page === "Leads" && (
                <LeadsPage
                  leads={filteredLeads}
                  selectedLead={selectedLead}
                  search={search}
                  setSearch={setSearch}
                  statusFilter={statusFilter}
                  setStatusFilter={setStatusFilter}
                  onSelect={setSelectedId}
                  onNew={() => setShowLeadForm(true)}
                  onStatus={updateLead}
                  onDraft={generateDraft}
                  draft={draft}
                  draftLoading={draftLoading}
                />
              )}
              {page === "Pipeline" && (
                <Pipeline
                  leads={leads}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setPage("Leads");
                  }}
                />
              )}
              {page === "AI Copilot" && (
                <Copilot
                  leads={leads}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  draft={draft}
                  setDraft={setDraft}
                  onGenerate={generateDraft}
                  loading={draftLoading}
                />
              )}
              {page === "Analytics" && (
                <AnalyticsPage analytics={analytics} leads={leads} />
              )}
              {page === "Sales Intelligence" && (
                <SalesIntelligencePage
                  leads={intelligence}
                  reviews={recommendationReviews}
                  reviewSavingIds={reviewSavingIds}
                  expandedReviewId={expandedReviewId}
                  onToggleReviews={(id) =>
                    setExpandedReviewId((current) =>
                      current === id ? null : id,
                    )
                  }
                  onLoadReviews={(id) => {
                    if (token) void loadRecommendationReviews(token, [id]);
                  }}
                  loading={intelligenceLoading}
                  error={intelligenceError}
                  priority={intelligencePriority}
                  setPriority={setIntelligencePriority}
                  followUp={intelligenceFollowUp}
                  setFollowUp={setIntelligenceFollowUp}
                  onReview={reviewRecommendation}
                  canReview={user?.role !== "ReadOnlyAnalyst"}
                  onRefresh={() => token && void loadIntelligence(token)}
                  onViewLead={(id) => {
                    setSelectedId(id);
                    setPage("Leads");
                  }}
                />
              )}
              {page === "User Management" && user?.role === "Admin" && (
                <UserManagement
                  token={token}
                  currentUserEmail={user.email}
                  onNotify={notify}
                />
              )}
            </>
          )}
        </div>
        <footer>
          © 2026 · Sales Intelligence{" "}
          <span>Workspace records · No real customer data</span>
        </footer>
      </main>
      {showLeadForm && (
        <LeadModal onClose={() => setShowLeadForm(false)} onSave={createLead} />
      )}
      {toast && (
        <div className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Login({
  onLogin,
  loading,
  error,
}: {
  onLogin: (email: string, password: string) => void;
  loading: boolean;
  error: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="login-page">
      <div className="login-decoration">
        <div className="orb orb-one" />
        <div className="orb orb-two" />
        <div className="login-brand">
          <img
            src="/migsun-logo.png"
            alt="Migsun — Dream It Live It"
            className="login-brand-logo"
          />
        </div>
        <div className="login-hero">
          <span className="eyebrow">
            <Sparkles size={15} /> SALES OPERATIONS
          </span>
          <h1>
            Turn every
            <br />
            <em>enquiry</em> into
            <br />
            an opportunity.
          </h1>
          <p>
            A focused sales workspace for lead prioritization, follow-up
            discipline and pipeline visibility.
          </p>
          <div className="login-proof">
            <div>
              <Target size={18} />
              <span>Lead scoring</span>
            </div>
            <div>
              <MessageSquareText size={18} />
              <span>Follow-up copilot</span>
            </div>
            <div>
              <Activity size={18} />
              <span>Sales analytics</span>
            </div>
          </div>
        </div>
        <div className="login-foot">
          Independent product concept · Sample records
        </div>
      </div>
      <div className="login-panel">
        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            onLogin(email, password);
          }}
        >
          <div className="mobile-login-brand">
            <div className="brand-mark">
              <Building2 size={23} />
            </div>
            <strong>MIGSUN SALES INTELLIGENCE</strong>
          </div>
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your workspace</h2>
          <p>Sign in with your workspace credentials.</p>
          {error && (
            <div className="form-error">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
          <label>
            Email address
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button className="primary-btn login-submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"} <ArrowUpRight size={17} />
          </button>
          <div className="security-note">
            <ShieldCheck size={17} />
            <span>
              Secure API session. Do not enter real customer data into this
              environment.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string | number;
  note: string;
  icon: typeof Users;
  trend?: "up" | "down";
}) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <div className="metric-icon">
          <Icon size={19} />
        </div>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-note">
        {trend &&
          (trend === "up" ? (
            <ArrowUpRight size={14} />
          ) : (
            <ArrowDownRight size={14} />
          ))}
        <span>{note}</span>
      </div>
    </div>
  );
}
function Overview({
  dashboard,
  leads,
  onNavigate,
  onSelect,
}: {
  dashboard: Dashboard | null;
  leads: Lead[];
  onNavigate: (p: Page) => void;
  onSelect: (id: string) => void;
}) {
  const priorityLeads = [...leads]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const stages = [
    "New",
    "Contacted",
    "Qualified",
    "SiteVisit",
    "Negotiation",
    "Booked",
    "Lost",
  ];
  const counts = stages.map((s) => ({
    stage: s,
    count: leads.filter((l) => l.status === s).length,
  }));
  const max = Math.max(1, ...counts.map((c) => c.count));
  return (
    <>
      <PageHeading
        eyebrow="OVERVIEW / SALES OPERATIONS"
        title="Good morning, team."
        subtitle="Here's what's happening across your property sales portfolio today."
        action={
          <button className="primary-btn" onClick={() => onNavigate("Leads")}>
            <Plus size={17} /> Manage leads
          </button>
        }
      />
      <div className="metrics-grid">
        <MetricCard
          label="Total leads"
          value={dashboard?.totalLeads ?? leads.length}
          note="Across the portfolio"
          icon={Users}
        />
        <MetricCard
          label="High-priority leads"
          value={
            dashboard?.highPriority ??
            leads.filter((l) => l.priority === "High").length
          }
          note="Based on rule score"
          icon={Target}
        />
        <MetricCard
          label="Site visits this week"
          value={dashboard?.siteVisitsThisWeek ?? 0}
          note="Updated in last 7 days"
          icon={CalendarClock}
        />
        <MetricCard
          label="Overdue follow-ups"
          value={dashboard?.overdueFollowUps ?? 0}
          note="Requires review"
          icon={AlertCircle}
        />
      </div>
      <div className="overview-grid">
        <section className="panel pipeline-panel">
          <div className="panel-heading">
            <div>
              <h3>Lead pipeline</h3>
              <p>Current opportunities by stage</p>
            </div>
            <button className="text-btn" onClick={() => onNavigate("Pipeline")}>
              View pipeline <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="stage-bars">
            {counts.map((c) => (
              <div className="stage-row" key={c.stage}>
                <span>{displayStatus(c.stage)}</span>
                <div className="bar-track">
                  <div
                    className={`bar-fill bar-${c.stage.toLowerCase()}`}
                    style={{ width: `${(c.count / max) * 100}%` }}
                  />
                </div>
                <strong>{c.count}</strong>
              </div>
            ))}
          </div>
          <div className="panel-footnote">
            Counts reflect current workspace records.
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Priority queue</h3>
              <p>Start with the strongest signals</p>
            </div>
            <span className="tiny-pill">{priorityLeads.length} leads</span>
          </div>
          <div className="priority-list">
            {priorityLeads.map((l) => (
              <button
                className="priority-item"
                key={l.id}
                onClick={() => onSelect(l.id)}
              >
                <div className="lead-avatar">
                  {l.fullName
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div className="priority-copy">
                  <strong>{l.fullName}</strong>
                  <span>{l.projectName}</span>
                  <small>Follow-up: {dateLabel(l.nextFollowUpUtc)}</small>
                </div>
                <div className="priority-score">
                  <strong>{l.score}</strong>
                  <span>score</span>
                </div>
              </button>
            ))}
          </div>
          <button
            className="secondary-btn full-btn"
            onClick={() => onNavigate("Leads")}
          >
            Open all leads <ArrowUpRight size={15} />
          </button>
        </section>
      </div>
      <div className="insight-strip">
        <div className="insight-icon">
          <Sparkles size={20} />
        </div>
        <div>
          <strong>Rule-based insight</strong>
          <p>
            {
              leads.filter(
                (l) =>
                  l.nextFollowUpUtc &&
                  new Date(l.nextFollowUpUtc) < new Date() &&
                  !["Booked", "Lost"].includes(l.status),
              ).length
            }{" "}
            active lead(s) have an overdue follow-up. Review ownership and next
            steps before contacting buyers.
          </p>
        </div>
        <button className="text-btn" onClick={() => onNavigate("Leads")}>
          Review now <ArrowUpRight size={14} />
        </button>
      </div>
    </>
  );
}

function LeadsPage(props: {
  leads: Lead[];
  selectedLead: Lead | null;
  search: string;
  setSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onStatus: (
    lead: Lead,
    patch: { status?: string; assignedTo?: string; notes?: string },
  ) => void;
  onDraft: (lead: Lead) => void;
  draft: string;
  draftLoading: boolean;
}) {
  const {
    leads,
    selectedLead,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    onSelect,
    onNew,
    onStatus,
    onDraft,
    draft,
    draftLoading,
  } = props;
  return (
    <>
      <PageHeading
        eyebrow="SALES OPERATIONS / CRM"
        title="Lead management"
        subtitle="Search prospects, review qualification signals and keep the next action clear."
        action={
          <button className="primary-btn" onClick={onNew}>
            <Plus size={17} /> Add lead
          </button>
        }
      />
      <div className="lead-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, project, email…"
          />
        </div>
        <div className="filter-box">
          <Filter size={16} />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option>All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {displayStatus(s)}
              </option>
            ))}
          </select>
        </div>
        <span className="result-count">{leads.length} results</span>
      </div>
      <div className="leads-layout">
        <section className="panel leads-table-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Prospect</th>
                  <th>Project</th>
                  <th>Stage</th>
                  <th>AI rule score</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => onSelect(l.id)}
                    className={selectedLead?.id === l.id ? "selected-row" : ""}
                  >
                    <td>
                      <div className="table-person">
                        <div className="lead-avatar small">
                          {l.fullName
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <div>
                          <strong>{l.fullName}</strong>
                          <span>{l.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="project-cell">{l.projectName}</span>
                      <small>{l.propertyType}</small>
                    </td>
                    <td>
                      <span
                        className={`status-badge status-${l.status.toLowerCase()}`}
                      >
                        {displayStatus(l.status)}
                      </span>
                    </td>
                    <td>
                      <div className="score-cell">
                        <div
                          className="score-ring"
                          style={
                            { "--score": `${l.score}%` } as React.CSSProperties
                          }
                        >
                          <span>{l.score}</span>
                        </div>
                        <span
                          className={`priority-text priority-${l.priority.toLowerCase()}`}
                        >
                          {l.priority}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {leads.length === 0 && (
              <div className="empty-state">
                <Users size={25} />
                <strong>No matching leads</strong>
                <span>Change your search or add a lead.</span>
              </div>
            )}
          </div>
        </section>
        {selectedLead ? (
          <aside className="panel lead-detail">
            <div className="detail-top">
              <span className="eyebrow">LEAD PROFILE</span>
              <span
                className={`status-badge status-${selectedLead.status.toLowerCase()}`}
              >
                {displayStatus(selectedLead.status)}
              </span>
            </div>
            <div className="detail-person">
              <div className="lead-avatar large">
                {selectedLead.fullName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <h2>{selectedLead.fullName}</h2>
              <p>{selectedLead.projectName}</p>
            </div>
            <div className="detail-score">
              <div>
                <span>Rule-based score</span>
                <strong>
                  {selectedLead.score}
                  <small>/100</small>
                </strong>
              </div>
              <span
                className={`priority-chip priority-${selectedLead.priority.toLowerCase()}`}
              >
                {selectedLead.priority} priority
              </span>
            </div>
            <div className="detail-fields">
              <DetailField label="Email" value={selectedLead.email} />
              <DetailField label="Phone" value={selectedLead.phone} />
              <DetailField
                label="Budget"
                value={money(selectedLead.budgetLakhs)}
              />
              <DetailField
                label="Timeline"
                value={
                  selectedLead.purchaseTimelineDays == null
                    ? "Not specified"
                    : `${selectedLead.purchaseTimelineDays} days`
                }
              />
              <DetailField label="Lead source" value={selectedLead.source} />
              <DetailField
                label="Assigned to"
                value={selectedLead.assignedTo}
              />
              <DetailField
                label="Next follow-up"
                value={dateLabel(selectedLead.nextFollowUpUtc)}
              />
            </div>
            <label className="select-label">
              Update pipeline stage
              <select
                value={selectedLead.status}
                onChange={(e) =>
                  onStatus(selectedLead, { status: e.target.value })
                }
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {displayStatus(s)}
                  </option>
                ))}
              </select>
            </label>
            <div className="copilot-mini">
              <div className="copilot-mini-heading">
                <Sparkles size={16} />
                <strong>Follow-up copilot</strong>
              </div>
              <p>
                Generate a contextual draft based on the lead's current stage.
              </p>
              <button
                className="secondary-btn full-btn"
                onClick={() => onDraft(selectedLead)}
                disabled={draftLoading}
              >
                {draftLoading ? (
                  "Creating draft…"
                ) : (
                  <>
                    <MessageSquareText size={15} /> Generate message draft
                  </>
                )}
              </button>
              {draft && (
                <div className="draft-result">
                  <p>{draft}</p>
                  <button
                    className="text-btn"
                    onClick={() => navigator.clipboard?.writeText(draft)}
                  >
                    Copy draft <Download size={13} />
                  </button>
                </div>
              )}
            </div>
          </aside>
        ) : (
          <aside className="panel lead-detail empty-detail">
            <Users size={28} />
            <strong>Select a lead</strong>
            <span>Choose a row to view the profile and follow-up actions.</span>
          </aside>
        )}
      </div>
    </>
  );
}
function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Pipeline({
  leads,
  onSelect,
}: {
  leads: Lead[];
  onSelect: (id: string) => void;
}) {
  const stages = [
    "New",
    "Contacted",
    "Qualified",
    "SiteVisit",
    "Negotiation",
    "Booked",
    "Lost",
  ];
  return (
    <>
      <PageHeading
        eyebrow="SALES OPERATIONS / PIPELINE"
        title="Opportunity pipeline"
        subtitle="A stage-by-stage view of the fictional portfolio. Select a lead to inspect its details."
      />
      <div className="kanban">
        {stages.map((stage) => {
          const items = leads.filter((l) => l.status === stage);
          return (
            <section className="kanban-column" key={stage}>
              <div className="kanban-heading">
                <span className={`stage-dot dot-${stage.toLowerCase()}`} />
                <strong>{displayStatus(stage)}</strong>
                <span>{items.length}</span>
              </div>
              <div className="kanban-cards">
                {items.map((l) => (
                  <button
                    className="kanban-card"
                    key={l.id}
                    onClick={() => onSelect(l.id)}
                  >
                    <div className="kanban-card-top">
                      <span className="tiny-project">{l.propertyType}</span>
                      <span
                        className={`priority-text priority-${l.priority.toLowerCase()}`}
                      >
                        {l.priority}
                      </span>
                    </div>
                    <strong>{l.fullName}</strong>
                    <span>{l.projectName}</span>
                    <div className="kanban-card-bottom">
                      <span>{money(l.budgetLakhs)}</span>
                      <span className="kanban-score">{l.score} pts</span>
                    </div>
                  </button>
                ))}
                {items.length === 0 && (
                  <div className="kanban-empty">No leads in this stage</div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function Copilot({
  leads,
  selectedId,
  setSelectedId,
  draft,
  setDraft,
  onGenerate,
  loading,
}: {
  leads: Lead[];
  selectedId: string | null;
  setSelectedId: (v: string) => void;
  draft: string;
  setDraft: (v: string) => void;
  onGenerate: (l: Lead, objective?: string) => void;
  loading: boolean;
}) {
  const [goal, setGoal] = useState("Invite for a site visit");
  const lead = leads.find((l) => l.id === selectedId) || leads[0];
  return (
    <>
      <PageHeading
        eyebrow="AI ASSIST / COPILOT"
        title="Follow-up copilot"
        subtitle="Create a reviewable draft using deterministic templates. No external AI provider is called."
      />
      <div className="copilot-layout">
        <section className="panel copilot-config">
          <div className="panel-heading">
            <div>
              <h3>
                <Sparkles size={18} /> Draft a follow-up
              </h3>
              <p>Context comes from the selected lead record.</p>
            </div>
            <span className="tiny-pill">Rule-based</span>
          </div>
          <label className="form-label">
            Choose a lead
            <select
              value={lead?.id || ""}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setDraft("");
              }}
            >
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.fullName} — {displayStatus(l.status)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Message objective
            <select value={goal} onChange={(e) => setGoal(e.target.value)}>
              <option>Invite for a site visit</option>
              <option>Share project information</option>
              <option>Check in after a visit</option>
            </select>
          </label>
          {lead && (
            <div className="context-card">
              <span className="eyebrow">LEAD CONTEXT</span>
              <div className="context-grid">
                <DetailField label="Project" value={lead.projectName} />
                <DetailField label="Budget" value={money(lead.budgetLakhs)} />
                <DetailField label="Stage" value={displayStatus(lead.status)} />
                <DetailField
                  label="Timeline"
                  value={
                    lead.purchaseTimelineDays == null
                      ? "Unknown"
                      : `${lead.purchaseTimelineDays} days`
                  }
                />
              </div>
            </div>
          )}
          <button
            className="primary-btn full-btn"
            disabled={!lead || loading}
            onClick={() => lead && onGenerate(lead, goal)}
          >
            <Sparkles size={16} />
            {loading ? "Generating…" : "Generate follow-up draft"}
          </button>
          <div className="compliance-note">
            <ShieldCheck size={17} />
            <span>
              Human review required. Verify price, availability, terms and
              project claims before sending.
            </span>
          </div>
        </section>
        <section className="panel draft-panel">
          <div className="draft-panel-title">
            <div className="draft-icon">
              <MessageSquareText size={20} />
            </div>
            <div>
              <h3>Message preview</h3>
              <p>Editable draft · Not sent automatically</p>
            </div>
          </div>
          {draft ? (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={9}
              />
              <div className="draft-actions">
                <button
                  className="secondary-btn"
                  onClick={() => {
                    void navigator.clipboard?.writeText(draft);
                  }}
                >
                  <Download size={15} /> Copy text
                </button>
                <button className="primary-btn" onClick={() => setDraft("")}>
                  <X size={15} /> Clear draft
                </button>
              </div>
            </>
          ) : (
            <div className="draft-placeholder">
              <div className="placeholder-art">
                <MessageSquareText size={28} />
                <Sparkles size={18} />
              </div>
              <strong>Your draft will appear here</strong>
              <span>
                Select a lead and generate a suggested follow-up. You can edit
                the message before copying it.
              </span>
            </div>
          )}
          <div className="draft-footnote">
            <ShieldCheck size={14} /> Generated from application rules; no
            message has been sent.
          </div>
        </section>
      </div>
    </>
  );
}

function AnalyticsPage({
  analytics,
  leads,
}: {
  analytics: Analytics | null;
  leads: Lead[];
}) {
  const stages = analytics?.stages || [];
  const sourcesData = analytics?.sources || [];
  const maxStage = Math.max(1, ...stages.map((s) => s.count));
  const maxSource = Math.max(1, ...sourcesData.map((s) => s.count));
  return (
    <>
      <PageHeading
        eyebrow="REPORTING / PERFORMANCE"
        title="Sales analytics"
        subtitle="Understand the distribution of fictional leads by stage and acquisition source."
      />
      <div className="metrics-grid analytics-metrics">
        <MetricCard
          label="Total leads"
          value={analytics?.totalLeads ?? leads.length}
          note="All current records"
          icon={Users}
        />
        <MetricCard
          label="Booked leads"
          value={analytics?.booked ?? 0}
          note="Recorded outcomes"
          icon={Check}
        />
        <MetricCard
          label="Lead-to-booking ratio"
          value={`${analytics?.conversionPercent ?? 0}%`}
          note="Booked / total leads"
          icon={Target}
        />
        <MetricCard
          label="Avg. rule score"
          value={
            leads.length
              ? Math.round(
                  leads.reduce((s, l) => s + l.score, 0) / leads.length,
                )
              : 0
          }
          note="Heuristic, not predictive"
          icon={Activity}
        />
      </div>
      <div className="analytics-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Pipeline distribution</h3>
              <p>Lead count by stage</p>
            </div>
          </div>
          <div className="analytics-bars">
            {stages.map((s) => (
              <div className="analytics-row" key={s.stage}>
                <div className="analytics-label">
                  <span>{displayStatus(s.stage)}</span>
                  <strong>{s.count}</strong>
                </div>
                <div className="bar-track">
                  <div
                    className={`bar-fill bar-${s.stage.toLowerCase()}`}
                    style={{ width: `${(s.count / maxStage) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Lead sources</h3>
              <p>Where enquiries originated</p>
            </div>
          </div>
          <div className="analytics-bars">
            {sourcesData.map((s) => (
              <div className="analytics-row" key={s.source}>
                <div className="analytics-label">
                  <span>{s.source.replace(/([A-Z])/g, " $1").trim()}</span>
                  <strong>{s.count}</strong>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill bar-source"
                    style={{ width: `${(s.count / maxSource) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="analytics-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Conversion by source</h3>
              <p>Booked leads divided by leads from each source</p>
            </div>
          </div>
          {(analytics?.sourcePerformance || [])
            .filter((s) => s.leads > 0)
            .map((s) => (
              <div className="analytics-row" key={s.source}>
                <div className="analytics-label">
                  <span>
                    {s.source.replace(/([A-Z])/g, " $1").trim()} · {s.booked}/
                    {s.leads} booked
                  </span>
                  <strong>{s.conversionPercent}%</strong>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill bar-source"
                    style={{ width: `${s.conversionPercent}%` }}
                  />
                </div>
              </div>
            ))}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Overdue follow-ups</h3>
              <p>Active leads whose next follow-up time has passed</p>
            </div>
            <span className="tiny-pill">
              {analytics?.overdueFollowUps?.length || 0} leads
            </span>
          </div>
          {(analytics?.overdueFollowUps || []).length === 0 ? (
            <div className="kanban-empty">
              No overdue follow-ups at this time.
            </div>
          ) : (
            <div className="priority-list">
              {analytics!.overdueFollowUps.map((l) => (
                <div className="priority-item" key={l.id}>
                  <div className="lead-avatar">
                    {l.fullName
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div className="priority-copy">
                    <strong>{l.fullName}</strong>
                    <span>
                      {l.projectName} · {displayStatus(l.status)}
                    </span>
                    <small>
                      Owner: {l.assignedTo} · Score {l.score}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <div className="insight-strip">
        <div className="insight-icon">
          <Activity size={20} />
        </div>
        <div>
          <strong>Interpretation note</strong>
          <p>
            These are current seeded records, not time-series trends. Source
            conversion is descriptive of the current records; lead scoring uses
            transparent rules and has not been trained or validated against
            historical outcomes.
          </p>
        </div>
      </div>
    </>
  );
}

function SalesIntelligencePage({
  leads,
  reviews,
  reviewSavingIds,
  expandedReviewId,
  onToggleReviews,
  onLoadReviews,
  loading,
  error,
  priority,
  setPriority,
  followUp,
  setFollowUp,
  onRefresh,
  onViewLead,
  onReview,
  canReview,
}: {
  leads: LeadIntelligence[];
  reviews: Record<string, RecommendationReview[]>;
  reviewSavingIds: string[];
  expandedReviewId: string | null;
  onToggleReviews: (id: string) => void;
  onLoadReviews: (id: string) => void;
  loading: boolean;
  error: string;
  priority: string;
  setPriority: (value: string) => void;
  followUp: string;
  setFollowUp: (value: string) => void;
  onRefresh: () => void;
  onViewLead: (id: string) => void;
  onReview: (lead: LeadIntelligence) => void;
  canReview: boolean;
}) {
  const overdue = leads.filter((x) => x.followUpState === "Overdue").length;
  const high = leads.filter((x) => x.priority === "High").length;
  const dueSoon = leads.filter(
    (x) => x.followUpState === "Due within 24 hours",
  ).length;
  return (
    <>
      <PageHeading
        eyebrow="RULE-BASED INTELLIGENCE / SALES OPERATIONS"
        title="Sales Intelligence"
        subtitle="Explainable lead priorities, follow-up urgency and recommended next actions. No paid AI API is used."
        action={
          <button className="primary-btn" onClick={onRefresh}>
            <Activity size={16} /> Refresh intelligence
          </button>
        }
      />
      <div className="metrics-grid">
        <MetricCard
          label="Leads analysed"
          value={leads.length}
          note="Based on current filters"
          icon={Users}
        />
        <MetricCard
          label="High priority"
          value={high}
          note="Rule score ≥ 70"
          icon={Target}
        />
        <MetricCard
          label="Overdue follow-ups"
          value={overdue}
          note="Needs review"
          icon={AlertCircle}
        />
        <MetricCard
          label="Due within 24 hours"
          value={dueSoon}
          note="Upcoming action"
          icon={CalendarClock}
        />
      </div>
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="lead-toolbar">
          <div className="filter-box">
            <Filter size={16} />
            <select
              aria-label="Filter by priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option>All</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </div>
          <div className="filter-box">
            <CalendarClock size={16} />
            <select
              aria-label="Filter by follow-up urgency"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
            >
              <option>All</option>
              <option>Overdue</option>
              <option>Due within 24 hours</option>
              <option>Scheduled</option>
              <option>Not scheduled</option>
              <option>Not required — lead is closed</option>
            </select>
          </div>
          <span className="result-count">{leads.length} results</span>
        </div>
      </section>
      {error && (
        <div className="error-banner">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}
      {loading ? (
        <div className="loading">
          <span className="spinner" /> Analysing leads…
        </div>
      ) : leads.length === 0 ? (
        <div className="panel empty-state">
          <BrainCircuit size={25} />
          <strong>No leads match these filters</strong>
          <span>Try another priority or follow-up state.</span>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {leads.map((lead) => (
            <section className="panel" key={lead.leadId}>
              <div
                className="panel-heading"
                style={{ alignItems: "flex-start" }}
              >
                <div>
                  <span className="eyebrow">{lead.projectName}</span>
                  <h3>{lead.fullName}</h3>
                  <p>
                    Owner: {lead.assignedTo} · Stage:{" "}
                    {displayStatus(lead.status)}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="score-cell">
                    <div
                      className="score-ring"
                      style={
                        { "--score": `${lead.score}%` } as React.CSSProperties
                      }
                    >
                      <span>{lead.score}</span>
                    </div>
                    <span
                      className={`priority-text priority-${lead.priority.toLowerCase()}`}
                    >
                      {lead.priority}
                    </span>
                  </div>
                  <small>{lead.followUpState}</small>
                </div>
              </div>
              <div className="insight-strip" style={{ marginTop: 14 }}>
                <div className="insight-icon">
                  <Sparkles size={20} />
                </div>
                <div>
                  <strong>{lead.recommendedAction}</strong>
                  <p>{lead.recommendationReason}</p>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <strong>Why this score?</strong>
                <ul style={{ marginTop: 8, paddingLeft: 22 }}>
                  {lead.scoreReasons.map((reason, i) => (
                    <li key={`${lead.leadId}-reason-${i}`}>{reason}</li>
                  ))}
                </ul>
              </div>
              <div
                className="detail-fields"
                style={{
                  marginTop: 16,
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 12,
                  alignItems: "stretch",
                }}
              >
                <DetailField label="Budget" value={money(lead.budgetLakhs)} />
                <DetailField
                  label="Purchase timeline"
                  value={
                    lead.purchaseTimelineDays == null
                      ? "Not specified"
                      : `${lead.purchaseTimelineDays} days`
                  }
                />
                <DetailField
                  label="Next follow-up"
                  value={dateLabel(lead.nextFollowUpUtc)}
                />
              </div>

              {reviews[lead.leadId]?.length > 0 && (
                <div
                  className="panel-footnote"
                  style={{ marginTop: 12, color: "var(--success, #16794b)" }}
                >
                  <Check
                    size={14}
                    style={{ display: "inline", verticalAlign: "middle" }}
                  />{" "}
                  <strong>Reviewed</strong> by{" "}
                  {reviews[lead.leadId][0].reviewerName} on{" "}
                  {new Date(
                    reviews[lead.leadId][0].reviewedAtUtc,
                  ).toLocaleString("en-IN")}
                </div>
              )}
              <div
                className="intelligence-card-actions"
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 14,
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="secondary-btn"
                  onClick={() => {
                    onToggleReviews(lead.leadId);
                    onLoadReviews(lead.leadId);
                  }}
                  aria-expanded={expandedReviewId === lead.leadId}
                >
                  <CalendarClock size={15} />{" "}
                  {expandedReviewId === lead.leadId
                    ? "Hide review history"
                    : `Review history (${reviews[lead.leadId]?.length ?? 0})`}
                </button>
                {canReview && (
                  <button
                    className="primary-btn"
                    disabled={reviewSavingIds.includes(lead.leadId)}
                    onClick={() => void onReview(lead)}
                  >
                    <Check size={15} />{" "}
                    {reviewSavingIds.includes(lead.leadId)
                      ? "Saving review…"
                      : (reviews[lead.leadId]?.length ?? 0) > 0
                        ? "Review again"
                        : "Review recommendation"}
                  </button>
                )}
                <button
                  className="secondary-btn"
                  onClick={() => onViewLead(lead.leadId)}
                >
                  <Users size={15} /> View lead
                </button>
              </div>
              {expandedReviewId === lead.leadId && (
                <div className="panel" style={{ marginTop: 12, padding: 16 }}>
                  <strong>Recommendation review history</strong>
                  {(reviews[lead.leadId] ?? []).length === 0 ? (
                    <p style={{ marginTop: 8 }}>
                      No reviews recorded for this lead yet.
                    </p>
                  ) : (
                    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                      {(reviews[lead.leadId] ?? []).map((review) => (
                        <div
                          key={review.id}
                          style={{
                            borderTop: "1px solid var(--border, #e5e7eb)",
                            paddingTop: 10,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              flexWrap: "wrap",
                            }}
                          >
                            <strong>{review.reviewerName}</strong>
                            <small>
                              {new Date(review.reviewedAtUtc).toLocaleString(
                                "en-IN",
                              )}
                            </small>
                          </div>
                          <small>{review.reviewerEmail}</small>
                          <p style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                            {review.recommendationText}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      <div className="panel-footnote" style={{ marginTop: 16 }}>
        Rule-based recommendations are decision support, not predictions. Verify
        lead details and follow-up plans before contacting a prospect.
      </div>
    </>
  );
}

function LeadModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (lead: NewLead) => void;
}) {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    projectName: "Residential Project",
    propertyType: "Residential",
    budgetLakhs: "",
    purchaseTimelineDays: "90",
    source: "Website",
    status: "New",
    notes: "",
    assignedTo: "Unassigned",
  });
  const [saving, setSaving] = useState(false);
  const change = (key: keyof typeof form, value: string) =>
    setForm((old) => ({ ...old, [key]: value }));
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="modal"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          await onSave({
            ...form,
            budgetLakhs: form.budgetLakhs ? Number(form.budgetLakhs) : null,
            purchaseTimelineDays: form.purchaseTimelineDays
              ? Number(form.purchaseTimelineDays)
              : null,
            nextFollowUpUtc: new Date(Date.now() + 86400000).toISOString(),
          });
          setSaving(false);
        }}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">CRM / NEW RECORD</span>
            <h2>Add lead</h2>
            <p>Enter the prospect's details.</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={19} />
          </button>
        </div>
        <div className="modal-grid">
          <label className="form-label full-span">
            Full name
            <input
              value={form.fullName}
              onChange={(e) => change("fullName", e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label className="form-label">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => change("email", e.target.value)}
              required
              maxLength={180}
            />
          </label>
          <label className="form-label">
            Phone
            <input
              value={form.phone}
              onChange={(e) => change("phone", e.target.value)}
              required
              maxLength={30}
            />
          </label>
          <label className="form-label full-span">
            Project name
            <input
              value={form.projectName}
              onChange={(e) => change("projectName", e.target.value)}
              required
              maxLength={160}
            />
          </label>
          <label className="form-label">
            Property type
            <select
              value={form.propertyType}
              onChange={(e) => change("propertyType", e.target.value)}
            >
              <option>Residential</option>
              <option>Commercial</option>
              <option>Retail</option>
              <option>Office</option>
            </select>
          </label>
          <label className="form-label">
            Budget (₹ lakhs)
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.budgetLakhs}
              onChange={(e) => change("budgetLakhs", e.target.value)}
            />
          </label>
          <label className="form-label">
            Timeline (days)
            <input
              type="number"
              min="0"
              value={form.purchaseTimelineDays}
              onChange={(e) => change("purchaseTimelineDays", e.target.value)}
            />
          </label>
          <label className="form-label">
            Lead source
            <select
              value={form.source}
              onChange={(e) => change("source", e.target.value)}
            >
              {sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Pipeline stage
            <select
              value={form.status}
              onChange={(e) => change("status", e.target.value)}
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {displayStatus(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            Assigned to
            <input
              value={form.assignedTo}
              onChange={(e) => change("assignedTo", e.target.value)}
            />
          </label>
          <label className="form-label full-span">
            Notes
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => change("notes", e.target.value)}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn" disabled={saving}>
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Plus size={16} /> Create lead
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

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
  Clock,
  ClipboardCheck,
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
  | "Action Center"
  | "User Management";
type User = { name: string; email: string; role: string };

type ActionCenterTask = {
  leadId: string;
  fullName: string;
  projectName: string;
  status: string;
  assignedTo: string;
  nextFollowUpUtc: string | null;
  score: number;
  priority: string;
  isCompleted: boolean;
  completedAtUtc: string | null;
  completedByName: string | null;
};

type ActionCenterResponse = {
  generatedAtUtc: string;
  completedToday: number;
  tasks: ActionCenterTask[];
};

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
  const [analyticsDays, setAnalyticsDays] = useState<30 | 90 | 365>(90);
  const [actionTasks, setActionTasks] = useState<ActionCenterTask[]>([]);
  const [actionCompletedToday, setActionCompletedToday] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionBusyIds, setActionBusyIds] = useState<string[]>([]);
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

  const loadActionCenter = useCallback(async (auth: string) => {
    setActionLoading(true);
    setActionError("");
    try {
      const result = await api<ActionCenterResponse>(
        "/api/action-center",
        auth,
      );
      setActionTasks(result.tasks);
      setActionCompletedToday(result.completedToday);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not load Action Center",
      );
    } finally {
      setActionLoading(false);
    }
  }, []);

  async function completeFollowUp(task: ActionCenterTask) {
    if (!token || actionBusyIds.includes(task.leadId)) return;
    setActionBusyIds((ids) => [...ids, task.leadId]);
    setActionError("");
    try {
      await api(`/api/action-center/${task.leadId}/complete`, token, {
        method: "POST",
      });
      await loadActionCenter(token);
      notify(`Follow-up completed for ${task.fullName}.`);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not complete follow-up",
      );
    } finally {
      setActionBusyIds((ids) => ids.filter((id) => id !== task.leadId));
    }
  }

  async function scheduleFollowUp(leadId: string, localDateTime: string) {
    if (!token || !localDateTime || actionBusyIds.includes(leadId)) return;
    const date = new Date(localDateTime);
    if (Number.isNaN(date.getTime())) {
      setActionError("Choose a valid follow-up date and time.");
      return;
    }
    setActionBusyIds((ids) => [...ids, leadId]);
    setActionError("");
    try {
      await api(`/api/action-center/${leadId}/schedule`, token, {
        method: "PUT",
        body: JSON.stringify({ nextFollowUpUtc: date.toISOString() }),
      });
      await Promise.all([loadActionCenter(token), loadData(token)]);
      notify("Follow-up scheduled.");
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not schedule follow-up",
      );
    } finally {
      setActionBusyIds((ids) => ids.filter((id) => id !== leadId));
    }
  }

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

  useEffect(() => {
    if (token && page === "Action Center") void loadActionCenter(token);
  }, [token, page, loadActionCenter]);
  const [mobileNav, setMobileNav] = useState(false);

  const selectedLead = leads.find((l) => l.id === selectedId) || null;
  const loadData = useCallback(
    async (auth: string, days: 30 | 90 | 365 = analyticsDays) => {
      setLoading(true);
      setError("");
      try {
        const [d, l, a] = await Promise.all([
          api<Dashboard>("/api/dashboard", auth),
          api<Lead[]>("/api/leads", auth),
          api<Analytics>(`/api/analytics?days=${days}`, auth),
        ]);
        setDashboard(d);
        setLeads(l);
        setAnalytics(a);
        setSelectedId((current) =>
          current && l.some((x) => x.id === current)
            ? current
            : l[0]?.id || null,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unable to load data";
        setError(message);
        if (message.includes("Session expired")) signOut();
      } finally {
        setLoading(false);
      }
    },
    [analyticsDays],
  );

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
    { name: "Action Center", icon: ClipboardCheck },
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
                  token={token}
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
                <AnalyticsPage
                  analytics={analytics}
                  leads={leads}
                  rangeDays={analyticsDays}
                  onRangeChange={setAnalyticsDays}
                />
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
              {page === "Action Center" && (
                <ActionCenterPage
                  tasks={actionTasks}
                  completedToday={actionCompletedToday}
                  loading={actionLoading}
                  error={actionError}
                  busyIds={actionBusyIds}
                  canWrite={user?.role !== "ReadOnlyAnalyst"}
                  onRefresh={() => token && void loadActionCenter(token)}
                  onComplete={completeFollowUp}
                  onSchedule={scheduleFollowUp}
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
    .filter((lead) => !["Booked", "Lost"].includes(lead.status))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const stages = [
    "New",
    "Contacted",
    "Qualified",
    "SiteVisit",
    "Negotiation",
    "Booked",
    "Lost",
  ];
  const counts = stages.map((stage) => ({
    stage,
    count: leads.filter((lead) => lead.status === stage).length,
  }));
  const maxStageCount = Math.max(1, ...counts.map((item) => item.count));
  const openLeads = leads.filter(
    (lead) => !["Booked", "Lost"].includes(lead.status),
  );
  const qualifiedLeads = leads.filter((lead) =>
    ["Qualified", "SiteVisit", "Negotiation"].includes(lead.status),
  );
  const bookedLeads = leads.filter((lead) => lead.status === "Booked");
  const overdueLeads = openLeads.filter(
    (lead) =>
      lead.nextFollowUpUtc && new Date(lead.nextFollowUpUtc) < new Date(),
  );
  const unassignedLeads = openLeads.filter(
    (lead) =>
      !lead.assignedTo || lead.assignedTo.toLowerCase() === "unassigned",
  );
  const pipelineBudget = openLeads.reduce(
    (sum, lead) => sum + (lead.budgetLakhs ?? 0),
    0,
  );
  const conversion = leads.length
    ? Math.round((bookedLeads.length / leads.length) * 100)
    : 0;
  const today = new Date();
  const followUpDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    return {
      date,
      label:
        index === 0
          ? "Today"
          : date.toLocaleDateString("en-IN", { weekday: "short" }),
      count: openLeads.filter((lead) => {
        if (!lead.nextFollowUpUtc) return false;
        const followUp = new Date(lead.nextFollowUpUtc);
        return followUp >= date && followUp < nextDay;
      }).length,
    };
  });
  const maxFollowUps = Math.max(1, ...followUpDays.map((day) => day.count));
  const insights = [
    overdueLeads.length > 0
      ? {
          title: `${overdueLeads.length} overdue follow-up${overdueLeads.length === 1 ? "" : "s"}`,
          detail:
            "Review these prospects first to prevent missed opportunities.",
          action: "Open Action Center",
          page: "Action Center" as Page,
          icon: AlertCircle,
          tone: "warning",
        }
      : {
          title: "No overdue follow-ups",
          detail:
            "Keep the pipeline healthy by maintaining scheduled next steps.",
          action: "View Action Center",
          page: "Action Center" as Page,
          icon: Check,
          tone: "positive",
        },
    unassignedLeads.length > 0
      ? {
          title: `${unassignedLeads.length} open lead${unassignedLeads.length === 1 ? "" : "s"} unassigned`,
          detail: "Assign an owner so each enquiry has a clear next step.",
          action: "Manage leads",
          page: "Leads" as Page,
          icon: Users,
          tone: "warning",
        }
      : {
          title: "Open leads have owners",
          detail: "Continue tracking ownership and follow-up dates.",
          action: "Manage leads",
          page: "Leads" as Page,
          icon: Users,
          tone: "positive",
        },
    qualifiedLeads.length > 0
      ? {
          title: `${qualifiedLeads.length} qualified or later-stage leads`,
          detail: "Prioritise site visits and negotiation conversations.",
          action: "View pipeline",
          page: "Pipeline" as Page,
          icon: Target,
          tone: "neutral",
        }
      : {
          title: "Qualification opportunity",
          detail:
            "Review new enquiries and capture budget and purchase timeline.",
          action: "Review leads",
          page: "Leads" as Page,
          icon: Target,
          tone: "neutral",
        },
  ];
  return (
    <>
      <PageHeading
        eyebrow="OVERVIEW / SALES OPERATIONS"
        title="Sales performance at a glance"
        subtitle="A focused view of pipeline health, follow-up workload, and next actions."
        action={
          <button className="primary-btn" onClick={() => onNavigate("Leads")}>
            <Plus size={17} /> Manage leads
          </button>
        }
      />
      <div className="metrics-grid overview-kpis">
        <MetricCard
          label="Total leads"
          value={dashboard?.totalLeads ?? leads.length}
          note="All current records"
          icon={Users}
        />
        <MetricCard
          label="Qualified pipeline"
          value={qualifiedLeads.length}
          note="Qualified · site visit · negotiation"
          icon={Target}
        />
        <MetricCard
          label="Bookings this month"
          value={dashboard?.bookingsThisMonth ?? bookedLeads.length}
          note="Recorded booking outcomes"
          icon={Check}
        />
        <MetricCard
          label="Lead conversion"
          value={`${conversion}%`}
          note={`${bookedLeads.length} booked of ${leads.length} leads`}
          icon={Activity}
        />
      </div>
      <div className="overview-secondary-kpis">
        <button
          className="secondary-kpi"
          onClick={() => onNavigate("Action Center")}
        >
          <span className="secondary-kpi-icon warning">
            <AlertCircle size={17} />
          </span>
          <span>
            <small>Overdue follow-ups</small>
            <strong>
              {dashboard?.overdueFollowUps ?? overdueLeads.length}
            </strong>
          </span>
          <ArrowUpRight size={16} />
        </button>
        <button className="secondary-kpi" onClick={() => onNavigate("Leads")}>
          <span className="secondary-kpi-icon">
            <Users size={17} />
          </span>
          <span>
            <small>Unassigned open leads</small>
            <strong>{unassignedLeads.length}</strong>
          </span>
          <ArrowUpRight size={16} />
        </button>
        <div className="secondary-kpi budget-kpi">
          <span className="secondary-kpi-icon">
            <Building2 size={17} />
          </span>
          <span>
            <small>Known open pipeline budget</small>
            <strong>₹{pipelineBudget.toLocaleString("en-IN")}L</strong>
          </span>
          <span className="kpi-caption">Excludes unspecified budgets</span>
        </div>
      </div>
      <div className="dashboard-visual-grid">
        <section className="panel dashboard-panel">
          <div className="panel-heading">
            <div>
              <h3>Pipeline health</h3>
              <p>Current lead count by stage</p>
            </div>
            <button className="text-btn" onClick={() => onNavigate("Pipeline")}>
              Explore pipeline <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="stage-bars dashboard-stage-bars">
            {counts.map((item) => (
              <div className="stage-row" key={item.stage}>
                <span>{displayStatus(item.stage)}</span>
                <div className="bar-track">
                  <div
                    className={`bar-fill bar-${item.stage.toLowerCase()}`}
                    style={{ width: `${(item.count / maxStageCount) * 100}%` }}
                  />
                </div>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
          <div className="panel-footnote">
            Live distribution from current workspace records.
          </div>
        </section>
        <section className="panel dashboard-panel">
          <div className="panel-heading">
            <div>
              <h3>Follow-up outlook</h3>
              <p>Scheduled open-lead follow-ups for the next 7 days</p>
            </div>
            <span className="tiny-pill">
              {followUpDays.reduce((sum, day) => sum + day.count, 0)} scheduled
            </span>
          </div>
          <div className="followup-trend">
            {followUpDays.map((day) => (
              <div className="followup-trend-day" key={day.date.toISOString()}>
                <div className="followup-trend-bar-area">
                  <span className="followup-trend-count">
                    {day.count || ""}
                  </span>
                  <div
                    className={`followup-trend-bar ${day.label === "Today" ? "is-today" : ""}`}
                    style={{
                      height: `${Math.max(day.count ? 12 : 4, (day.count / maxFollowUps) * 100)}%`,
                    }}
                  />
                </div>
                <span className="followup-trend-label">{day.label}</span>
              </div>
            ))}
          </div>
          <div className="panel-footnote">
            This is a scheduled-activity outlook, not a historical sales
            forecast.
          </div>
        </section>
      </div>
      <div className="dashboard-bottom-grid">
        <section className="panel dashboard-panel">
          <div className="panel-heading">
            <div>
              <h3>Priority queue</h3>
              <p>Highest-scoring open leads to review</p>
            </div>
            <span className="tiny-pill">{priorityLeads.length} leads</span>
          </div>
          <div className="priority-list">
            {priorityLeads.map((lead) => (
              <button
                className="priority-item"
                key={lead.id}
                onClick={() => onSelect(lead.id)}
              >
                <div className="lead-avatar">
                  {lead.fullName
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <div className="priority-copy">
                  <strong>{lead.fullName}</strong>
                  <span>
                    {lead.projectName} · {displayStatus(lead.status)}
                  </span>
                  <small>Follow-up: {dateLabel(lead.nextFollowUpUtc)}</small>
                </div>
                <div className="priority-score">
                  <strong>{lead.score}</strong>
                  <span>score</span>
                </div>
              </button>
            ))}
            {priorityLeads.length === 0 && (
              <div className="empty-state">
                <Users size={22} />
                <strong>No open leads</strong>
                <span>New enquiries will appear here.</span>
              </div>
            )}
          </div>
          <button
            className="secondary-btn full-btn"
            onClick={() => onNavigate("Leads")}
          >
            Open all leads <ArrowUpRight size={15} />
          </button>
        </section>
        <section className="panel dashboard-panel">
          <div className="panel-heading">
            <div>
              <h3>Recommended actions</h3>
              <p>Rule-based signals from current records</p>
            </div>
            <Sparkles size={18} className="dashboard-sparkle" />
          </div>
          <div className="action-insight-list">
            {insights.map((insight) => {
              const InsightIcon = insight.icon;
              return (
                <div
                  className={`action-insight ${insight.tone}`}
                  key={insight.title}
                >
                  <div className="action-insight-icon">
                    <InsightIcon size={17} />
                  </div>
                  <div className="action-insight-copy">
                    <strong>{insight.title}</strong>
                    <p>{insight.detail}</p>
                    <button
                      className="text-btn"
                      onClick={() => onNavigate(insight.page)}
                    >
                      {insight.action} <ArrowUpRight size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="dashboard-disclaimer">
            <ShieldCheck size={14} /> Suggestions are deterministic rules, not
            predictive AI. No customer messages are sent.
          </div>
        </section>
      </div>
    </>
  );
}

type LeadStatusHistoryEntry = {
  status: string;
  changedAtUtc: string;
  changedBy: string;
};

function LeadsPage(props: {
  token: string;
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
    token,
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
  const [statusHistory, setStatusHistory] = useState<LeadStatusHistoryEntry[]>(
    [],
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadStatusHistory() {
      if (!selectedLead || !token) {
        setStatusHistory([]);
        setHistoryError("");
        return;
      }

      setHistoryLoading(true);
      setHistoryError("");
      try {
        const entries = await api<LeadStatusHistoryEntry[]>(
          `/api/leads/${selectedLead.id}/status-history`,
          token,
        );
        if (!cancelled) setStatusHistory(entries);
      } catch (e) {
        if (!cancelled) {
          setHistoryError(
            e instanceof Error ? e.message : "Could not load status history",
          );
          setStatusHistory([]);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    void loadStatusHistory();
    return () => {
      cancelled = true;
    };
  }, [selectedLead?.id, token]);

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
            <section className="status-history-section">
              <div className="copilot-mini-heading">
                <Clock size={16} />
                <strong>Status history</strong>
                <span className="result-count">
                  {statusHistory.length} events
                </span>
              </div>
              {historyLoading ? (
                <p className="muted-copy">Loading status history…</p>
              ) : historyError ? (
                <p className="form-error">{historyError}</p>
              ) : statusHistory.length === 0 ? (
                <p className="muted-copy">
                  No status history is available for this lead.
                </p>
              ) : (
                <ol className="status-history-list">
                  {statusHistory.map((entry, index) => {
                    const previous =
                      index > 0 ? statusHistory[index - 1] : null;
                    const isCreation = entry.changedBy === "Lead created";
                    return (
                      <li
                        key={`${entry.changedAtUtc}-${index}`}
                        className="status-history-item"
                      >
                        <span className="status-history-marker" />
                        <div className="status-history-content">
                          <strong>
                            {isCreation
                              ? `Lead created · ${displayStatus(entry.status)}`
                              : `${previous ? displayStatus(previous.status) : "Status"} → ${displayStatus(entry.status)}`}
                          </strong>
                          <span>
                            {new Date(entry.changedAtUtc).toLocaleString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                          <small>
                            By {entry.changedBy || "Workspace user"}
                          </small>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
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
  rangeDays,
  onRangeChange,
}: {
  analytics: Analytics | null;
  leads: Lead[];
  rangeDays: 30 | 90 | 365;
  onRangeChange: (days: 30 | 90 | 365) => void;
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
        subtitle="Review current pipeline distribution and recorded historical trends."
        action={
          <label className="filter-box" style={{ gap: 8 }}>
            <CalendarClock size={16} />
            <span>Period</span>
            <select
              value={rangeDays}
              onChange={(e) =>
                onRangeChange(Number(e.target.value) as 30 | 90 | 365)
              }
              aria-label="Analytics date range"
            >
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last 365 days</option>
            </select>
          </label>
        }
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
      <div className="analytics-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Monthly lead creation</h3>
              <p>Based on each lead's recorded creation date</p>
            </div>
            <span className="tiny-pill">
              {analytics?.rangeDays ?? rangeDays} days
            </span>
          </div>
          {(analytics?.monthlyLeadCreation || []).length === 0 ? (
            <div className="kanban-empty">
              No monthly trend data returned by the API.
            </div>
          ) : (
            <div className="analytics-bars">
              {(analytics?.monthlyLeadCreation || []).map((item) => {
                const max = Math.max(
                  1,
                  ...(analytics?.monthlyLeadCreation || []).map((x) => x.leads),
                );
                return (
                  <div className="analytics-row" key={item.month}>
                    <div className="analytics-label">
                      <span>{item.month}</span>
                      <strong>{item.leads}</strong>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill bar-source"
                        style={{ width: `${(item.leads / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Recorded status transitions</h3>
              <p>Events captured by the new history tracker</p>
            </div>
          </div>
          {(analytics?.monthlyStatusTransitions || []).length === 0 ? (
            <div className="kanban-empty">
              No status history is available yet. New changes will be recorded
              after the backend migration is applied.
            </div>
          ) : (
            <div className="analytics-bars">
              {(analytics?.monthlyStatusTransitions || []).map((item) => {
                const max = Math.max(
                  1,
                  ...(analytics?.monthlyStatusTransitions || []).map(
                    (x) => x.transitions,
                  ),
                );
                return (
                  <div className="analytics-row" key={item.month}>
                    <div className="analytics-label">
                      <span>
                        {item.month} · Booked {item.booked} · Site visits{" "}
                        {item.siteVisits}
                      </span>
                      <strong>{item.transitions} changes</strong>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill bar-source"
                        style={{ width: `${(item.transitions / max) * 100}%` }}
                      />
                    </div>
                    <div className="muted-note">Lost: {item.lost}</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
      <div className="analytics-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Budget overview</h3>
              <p>Lead budget estimates, not recognized revenue</p>
            </div>
          </div>
          <div className="analytics-row">
            <div className="analytics-label">
              <span>Active pipeline budget</span>
              <strong>
                ₹{(analytics?.pipelineBudgetLakhs ?? 0).toLocaleString("en-IN")}
                L
              </strong>
            </div>
          </div>
          <div className="analytics-row">
            <div className="analytics-label">
              <span>Booked-lead budget</span>
              <strong>
                ₹{(analytics?.bookedBudgetLakhs ?? 0).toLocaleString("en-IN")}L
              </strong>
            </div>
          </div>
          <p className="muted-note">
            {analytics?.statusHistoryCoverage ||
              "Status history coverage will be reported by the backend when available."}
          </p>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Performance by project</h3>
              <p>Current lead outcomes grouped by project</p>
            </div>
          </div>
          {(analytics?.projectPerformance || []).length === 0 ? (
            <div className="kanban-empty">
              Project breakdown is not available from the current API response.
            </div>
          ) : (
            <div className="analytics-bars">
              {(analytics?.projectPerformance || []).map((item) => (
                <div className="analytics-row" key={item.project}>
                  <div className="analytics-label">
                    <span>
                      {item.project} · {item.booked}/{item.leads} booked
                    </span>
                    <strong>{item.conversionPercent}%</strong>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill bar-source"
                      style={{
                        width: `${Math.max(0, Math.min(100, item.conversionPercent))}%`,
                      }}
                    />
                  </div>
                  <div className="muted-note">
                    Pipeline ₹{item.pipelineBudgetLakhs.toLocaleString("en-IN")}
                    L · Booked budget ₹
                    {item.bookedBudgetLakhs.toLocaleString("en-IN")}L
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <div className="analytics-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Performance by executive</h3>
              <p>Current assigned owner and pipeline</p>
            </div>
          </div>
          {(analytics?.executivePerformance || []).length === 0 ? (
            <div className="kanban-empty">
              Executive breakdown is not available from the current API
              response.
            </div>
          ) : (
            <div className="analytics-bars">
              {(analytics?.executivePerformance || []).map((item) => (
                <div className="analytics-row" key={item.assignedTo}>
                  <div className="analytics-label">
                    <span>
                      {item.assignedTo} · {item.booked}/{item.leads} booked
                    </span>
                    <strong>{item.conversionPercent}%</strong>
                  </div>
                  <div className="bar-track">
                    <div
                      className="bar-fill bar-source"
                      style={{
                        width: `${Math.max(0, Math.min(100, item.conversionPercent))}%`,
                      }}
                    />
                  </div>
                  <div className="muted-note">
                    Pipeline ₹{item.pipelineBudgetLakhs.toLocaleString("en-IN")}
                    L · Booked budget ₹
                    {item.bookedBudgetLakhs.toLocaleString("en-IN")}L
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h3>Reporting notes</h3>
              <p>How to interpret these figures</p>
            </div>
          </div>
          <p className="muted-note">
            Lead creation uses the saved CreatedAtUtc field. Status transitions
            are only reliable from the date status-history tracking is deployed.
            Older stage dates are not reconstructed. Budget amounts are prospect
            budget estimates, not confirmed revenue.
          </p>
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

function ActionCenterPage({
  tasks,
  completedToday,
  loading,
  error,
  busyIds,
  canWrite,
  onRefresh,
  onComplete,
  onSchedule,
  onViewLead,
}: {
  tasks: ActionCenterTask[];
  completedToday: number;
  loading: boolean;
  error: string;
  busyIds: string[];
  canWrite: boolean;
  onRefresh: () => void;
  onComplete: (task: ActionCenterTask) => void;
  onSchedule: (leadId: string, localDateTime: string) => void;
  onViewLead: (leadId: string) => void;
}) {
  const [filter, setFilter] = useState("All actions");
  const [scheduleValues, setScheduleValues] = useState<Record<string, string>>(
    {},
  );
  const now = new Date();
  const activeTasks = tasks.filter(
    (task) => !["Booked", "Lost"].includes(task.status),
  );
  const dueToday = activeTasks.filter(
    (task) =>
      task.nextFollowUpUtc &&
      new Date(task.nextFollowUpUtc).toDateString() === now.toDateString() &&
      !task.isCompleted,
  ).length;
  const overdue = activeTasks.filter(
    (task) =>
      task.nextFollowUpUtc &&
      new Date(task.nextFollowUpUtc) < now &&
      !task.isCompleted,
  ).length;
  const highPriority = activeTasks.filter(
    (task) => task.priority === "High" && !task.isCompleted,
  ).length;
  const unassigned = activeTasks.filter(
    (task) =>
      !task.assignedTo || task.assignedTo.toLowerCase() === "unassigned",
  ).length;
  const sorted = [...activeTasks].sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    const aDue = a.nextFollowUpUtc
      ? new Date(a.nextFollowUpUtc).getTime()
      : Number.MAX_SAFE_INTEGER;
    const bDue = b.nextFollowUpUtc
      ? new Date(b.nextFollowUpUtc).getTime()
      : Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;
    return b.score - a.score;
  });
  const visible = sorted.filter((task) => {
    if (filter === "Overdue")
      return (
        !!task.nextFollowUpUtc &&
        new Date(task.nextFollowUpUtc) < now &&
        !task.isCompleted
      );
    if (filter === "Due today")
      return (
        !!task.nextFollowUpUtc &&
        new Date(task.nextFollowUpUtc).toDateString() === now.toDateString() &&
        !task.isCompleted
      );
    if (filter === "High priority")
      return task.priority === "High" && !task.isCompleted;
    if (filter === "Unassigned")
      return !task.assignedTo || task.assignedTo.toLowerCase() === "unassigned";
    if (filter === "Completed") return task.isCompleted;
    return true;
  });
  return (
    <>
      <PageHeading
        eyebrow="DAILY SALES EXECUTION"
        title="Today's Action Center"
        subtitle="Prioritise follow-ups, close the loop on completed actions, and schedule the next contact. Changes are saved to the API."
        action={
          <button className="primary-btn" onClick={onRefresh}>
            <Activity size={16} /> Refresh actions
          </button>
        }
      />
      <div className="metrics-grid">
        <MetricCard
          label="Overdue"
          value={overdue}
          note="Needs attention"
          icon={AlertCircle}
        />
        <MetricCard
          label="Due today"
          value={dueToday}
          note="Scheduled for today"
          icon={CalendarClock}
        />
        <MetricCard
          label="High priority"
          value={highPriority}
          note="Open high-score leads"
          icon={Target}
        />
        <MetricCard
          label="Completed today"
          value={completedToday}
          note="Saved completion records"
          icon={Check}
        />
      </div>
      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="lead-toolbar">
          <div className="filter-box">
            <Filter size={16} />
            <select
              aria-label="Filter action center"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option>All actions</option>
              <option>Overdue</option>
              <option>Due today</option>
              <option>High priority</option>
              <option>Unassigned</option>
              <option>Completed</option>
            </select>
          </div>
          <span className="result-count">
            {visible.length} actions · {unassigned} unassigned
          </span>
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
          <span className="spinner" /> Loading action queue…
        </div>
      ) : visible.length === 0 ? (
        <div className="panel empty-state">
          <ClipboardCheck size={26} />
          <strong>No actions in this view</strong>
          <span>
            Try another filter or schedule a follow-up for an active lead.
          </span>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {visible.map((task) => {
            const isOverdue =
              !!task.nextFollowUpUtc &&
              new Date(task.nextFollowUpUtc) < now &&
              !task.isCompleted;
            const defaultLocal = task.nextFollowUpUtc
              ? new Date(
                  new Date(task.nextFollowUpUtc).getTime() -
                    new Date(task.nextFollowUpUtc).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : "";
            return (
              <section className="panel" key={task.leadId}>
                <div
                  className="panel-heading"
                  style={{ alignItems: "flex-start" }}
                >
                  <div>
                    <span className="eyebrow">
                      {task.projectName} · {task.priority} priority
                    </span>
                    <h3>{task.fullName}</h3>
                    <p>
                      Owner: {task.assignedTo || "Unassigned"} · Stage:{" "}
                      {displayStatus(task.status)}
                    </p>
                    <small>
                      {task.nextFollowUpUtc
                        ? `Follow-up: ${dateLabel(task.nextFollowUpUtc)}`
                        : "No follow-up scheduled"}
                    </small>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 76 }}>
                    <div className="score-cell">
                      <div
                        className="score-ring"
                        style={
                          { "--score": `${task.score}%` } as React.CSSProperties
                        }
                      >
                        <span>{task.score}</span>
                      </div>
                      <span>score</span>
                    </div>
                    {task.isCompleted ? (
                      <span className="tiny-pill">Completed</span>
                    ) : isOverdue ? (
                      <span className="tiny-pill">Overdue</span>
                    ) : null}
                  </div>
                </div>
                {task.isCompleted && task.completedAtUtc && (
                  <p
                    style={{ margin: "8px 0", color: "var(--muted, #64748b)" }}
                  >
                    Completed by {task.completedByName || "workspace user"} ·{" "}
                    {new Date(task.completedAtUtc).toLocaleString("en-IN")}
                  </p>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                    marginTop: 14,
                  }}
                >
                  <button
                    className="secondary-btn"
                    onClick={() => onViewLead(task.leadId)}
                  >
                    <Users size={15} /> View lead
                  </button>
                  {canWrite && !task.isCompleted && task.nextFollowUpUtc && (
                    <button
                      className="primary-btn"
                      disabled={busyIds.includes(task.leadId)}
                      onClick={() => onComplete(task)}
                    >
                      <Check size={15} />{" "}
                      {busyIds.includes(task.leadId)
                        ? "Saving…"
                        : "Mark complete"}
                    </button>
                  )}
                  {canWrite && !task.isCompleted && (
                    <>
                      <input
                        aria-label={`Next follow-up for ${task.fullName}`}
                        type="datetime-local"
                        value={scheduleValues[task.leadId] ?? defaultLocal}
                        onChange={(e) =>
                          setScheduleValues((old) => ({
                            ...old,
                            [task.leadId]: e.target.value,
                          }))
                        }
                        style={{
                          minWidth: 210,
                          padding: "9px 10px",
                          border: "1px solid var(--border, #dbe2ea)",
                          borderRadius: 8,
                          background: "var(--surface, white)",
                          color: "inherit",
                        }}
                      />
                      <button
                        className="secondary-btn"
                        disabled={
                          busyIds.includes(task.leadId) ||
                          !(scheduleValues[task.leadId] ?? defaultLocal)
                        }
                        onClick={() =>
                          onSchedule(
                            task.leadId,
                            scheduleValues[task.leadId] ?? defaultLocal,
                          )
                        }
                      >
                        <Clock size={15} /> Schedule follow-up
                      </button>
                    </>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <div className="panel-footnote" style={{ marginTop: 16 }}>
        Completion and scheduling are recorded by the API. Priority continues to
        use the existing deterministic lead-scoring formula.
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

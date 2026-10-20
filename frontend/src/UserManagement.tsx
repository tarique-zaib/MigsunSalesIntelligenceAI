
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleUserRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import {
  api,
  managedUserRoles,
  type CreateManagedUser,
  type ManagedUser,
} from "./api";

type Props = {
  token: string;
  currentUserEmail: string;
  onNotify: (message: string) => void;
};

const initialForm: CreateManagedUser = {
  fullName: "",
  email: "",
  password: "",
  role: "SalesExecutive",
};

export default function UserManagement({
  token,
  currentUserEmail,
  onNotify,
}: Props) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateManagedUser>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await api<ManagedUser[]>("/api/admin/users", token);
      setUsers(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !term ||
        user.fullName.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term);

      const matchesRole = roleFilter === "All" || user.role === roleFilter;
      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Active" ? user.isActive : !user.isActive);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await api<ManagedUser>("/api/admin/users", token, {
        method: "POST",
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        }),
      });

      setForm(initialForm);
      setShowForm(false);
      onNotify("User account created.");
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create user.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: ManagedUser) {
    const action = user.isActive ? "deactivate" : "activate";

    if (
      !window.confirm(
        `Are you sure you want to ${action} ${user.fullName}?`,
      )
    ) {
      return;
    }

    setChangingId(user.id);
    setError("");

    try {
      await api<unknown>(
        `/api/admin/users/${encodeURIComponent(user.id)}/active`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({ isActive: !user.isActive }),
        },
      );

      onNotify(
        `${user.fullName} ${user.isActive ? "deactivated" : "activated"}.`,
      );
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update user.");
    } finally {
      setChangingId(null);
    }
  }

  const activeCount = users.filter((user) => user.isActive).length;

  return (
    <section className="page-content user-management">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ADMINISTRATION / ACCESS CONTROL</div>
          <h1>User Management</h1>
          <p>Create accounts and control access to the sales workspace.</p>
        </div>
        <button className="primary-btn" onClick={() => setShowForm(true)}>
          <Plus size={17} /> Add user
        </button>
      </div>

      <div className="metrics-grid user-metrics">
        <div className="metric-card">
          <div className="metric-top">
            <span>Total accounts</span>
            <div className="metric-icon"><CircleUserRound size={19} /></div>
          </div>
          <div className="metric-value">{users.length}</div>
          <div className="metric-note"><span>Registered workspace users</span></div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span>Active accounts</span>
            <div className="metric-icon"><UserCheck size={19} /></div>
          </div>
          <div className="metric-value">{activeCount}</div>
          <div className="metric-note"><span>Accounts currently enabled</span></div>
        </div>
        <div className="metric-card">
          <div className="metric-top">
            <span>Available roles</span>
            <div className="metric-icon"><ShieldCheck size={19} /></div>
          </div>
          <div className="metric-value">{managedUserRoles.length}</div>
          <div className="metric-note"><span>Role-based access levels</span></div>
        </div>
      </div>

      {error && (
        <div className="error-banner user-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
          <button className="icon-btn" onClick={() => setError("")} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}

      <section className="panel user-table-panel">
        <div className="panel-heading">
          <div>
            <h3>Workspace accounts</h3>
            <p>Manage roles and account status.</p>
          </div>
          <button className="secondary-btn" onClick={() => void loadUsers()} disabled={loading}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>

        <div className="user-filters">
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label="Search users"
              placeholder="Search name or email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select aria-label="Filter by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="All">All roles</option>
            {managedUserRoles.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="All">All statuses</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        {loading ? (
          <div className="loading"><LoaderCircle size={18} /> Loading accounts…</div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">
            <CircleUserRound size={28} />
            <strong>No users found</strong>
            <span>Try changing your search or filters.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Account action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="managed-user-name">{user.fullName}</div>
                      <div className="managed-user-email">{user.email}</div>
                    </td>
                    <td><span className="user-role-pill">{user.role}</span></td>
                    <td>
                      <span className={`user-status ${user.isActive ? "is-active" : "is-inactive"}`}>
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      {user.email.toLowerCase() === currentUserEmail.toLowerCase() ? (
                        <span className="current-user-label">Current account</span>
                      ) : (
                        <button
                          className={`user-action-btn ${user.isActive ? "deactivate" : "activate"}`}
                          disabled={changingId === user.id}
                          onClick={() => void toggleActive(user)}
                        >
                          {changingId === user.id ? (
                            <LoaderCircle size={14} />
                          ) : user.isActive ? (
                            <UserX size={14} />
                          ) : (
                            <CheckCircle2 size={14} />
                          )}
                          {user.isActive ? "Deactivate" : "Activate"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="user-table-footer">
          Showing {filteredUsers.length} of {users.length} accounts
        </div>
      </section>

      {showForm && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setShowForm(false);
        }}>
          <section className="modal user-create-modal" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
            <div className="panel-heading">
              <div>
                <h3 id="create-user-title">Create user account</h3>
                <p>Assign a role with the minimum access required.</p>
              </div>
              <button className="icon-btn" onClick={() => setShowForm(false)} disabled={saving} aria-label="Close dialog">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={createUser}>
              <div className="user-form-grid">
                <label className="form-label">
                  Full name
                  <input
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={120}
                    value={form.fullName}
                    onChange={(event) => setForm({ ...form, fullName: event.target.value })}
                  />
                </label>
                <label className="form-label">
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </label>
                <label className="form-label user-form-wide">
                  Temporary password
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={14}
                    maxLength={128}
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                  />
                  <small>At least 14 characters, including uppercase, lowercase, a number and a symbol.</small>
                </label>
                <label className="form-label user-form-wide">
                  Role
                  <select
                    value={form.role}
                    onChange={(event) => setForm({ ...form, role: event.target.value as CreateManagedUser["role"] })}
                  >
                    {managedUserRoles.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="secondary-btn" disabled={saving} onClick={() => setShowForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn" disabled={saving}>
                  {saving ? <LoaderCircle size={16} /> : <Plus size={16} />}
                  {saving ? "Creating…" : "Create account"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

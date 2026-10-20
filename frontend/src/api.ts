const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5080";

export type Lead = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  projectName: string;
  propertyType: string;
  budgetLakhs: number | null;
  purchaseTimelineDays: number | null;
  source: string;
  status: string;
  notes: string;
  assignedTo: string;
  nextFollowUpUtc: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  score: number;
  priority: "High" | "Medium" | "Low";
};
export type Dashboard = {
  totalLeads: number;
  highPriority: number;
  siteVisitsThisWeek: number;
  bookingsThisMonth: number;
  overdueFollowUps: number;
  fictionalData: boolean;
};
export type Analytics = {
  totalLeads: number;
  booked: number;
  conversionPercent: number;
  stages: { stage: string; count: number }[];
  sources: { source: string; count: number }[];
  sourcePerformance: {
    source: string;
    leads: number;
    booked: number;
    conversionPercent: number;
  }[];
  overdueFollowUps: {
    id: string;
    fullName: string;
    projectName: string;
    assignedTo: string;
    nextFollowUpUtc: string;
    status: string;
    score: number;
  }[];
  fictionalData: boolean;
};
export type NewLead = {
  fullName: string;
  email: string;
  phone: string;
  projectName: string;
  propertyType: string;
  budgetLakhs: number | null;
  purchaseTimelineDays: number | null;
  source: string;
  status: string;
  notes: string;
  assignedTo: string;
  nextFollowUpUtc: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    if (response.status === 401)
      throw new ApiError(
        "Session expired or credentials are invalid. Please sign in again.",
        401,
      );
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.message || body.title || body.detail || message;
      if (body.traceId) message += ` (Reference: ${body.traceId})`;
    } catch {
      /* response may not contain JSON */
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type ManagedUser = {
  id: string;
  fullName: string;
  email: string;
  role: "Admin" | "SalesManager" | "SalesExecutive" | "ReadOnlyAnalyst";
  isActive: boolean;
};

export type CreateManagedUser = {
  fullName: string;
  email: string;
  password: string;
  role: ManagedUser["role"];
};

export const managedUserRoles: ManagedUser["role"][] = [
  "Admin",
  "SalesManager",
  "SalesExecutive",
  "ReadOnlyAnalyst",
];

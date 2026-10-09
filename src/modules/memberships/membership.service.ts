import { ApiError } from "../../shared/api-error.js";
import { MembershipRepository } from "./membership.repository.js";

export class MembershipService {
  constructor(private readonly memberships = new MembershipRepository()) {}

  listPlans() {
    return this.memberships.listPlans();
  }

  getForUser(userId: string) {
    return this.memberships.findForUser(userId) ?? {
      user_id: userId,
      plan_code: "BASIC",
      name: "Basic",
      monthly_fee: 0,
      discount_percent: 0,
      status: "ACTIVE",
      started_at: null,
      expires_at: null
    };
  }

  activate(userId: string, planCode: "BASIC" | "SILVER" | "GOLD", months: number) {
    if (!this.memberships.findPlan(planCode)) throw new ApiError(404, "Membership plan not found");
    return this.memberships.activate(userId, planCode, months);
  }

  getDiscountPercent(userId: string): number {
    const membership = this.memberships.findForUser(userId);
    if (!membership || membership.status !== "ACTIVE") return 0;
    if (membership.expires_at && Date.parse(membership.expires_at) <= Date.now()) return 0;
    return membership.discount_percent;
  }
}

import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../../database/connection.js";

export type MembershipPlan = {
  code: "BASIC" | "SILVER" | "GOLD";
  name: string;
  monthly_fee: number;
  discount_percent: number;
  active: number;
};

export type UserMembership = MembershipPlan & {
  user_id: string;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  started_at: string;
  expires_at: string | null;
  updated_at: string;
};

export class MembershipRepository {
  constructor(private readonly database: DatabaseSync = getDatabase()) {}

  listPlans(): MembershipPlan[] {
    return this.database.prepare(
      "SELECT * FROM membership_plans WHERE active = 1 ORDER BY monthly_fee"
    ).all() as unknown as MembershipPlan[];
  }

  findPlan(code: string): MembershipPlan | undefined {
    return this.database.prepare(
      "SELECT * FROM membership_plans WHERE code = ? AND active = 1"
    ).get(code) as MembershipPlan | undefined;
  }

  findForUser(userId: string): UserMembership | undefined {
    return this.database.prepare(`
      SELECT um.*, mp.name, mp.monthly_fee, mp.discount_percent, mp.active
      FROM user_memberships um
      JOIN membership_plans mp ON mp.code = um.plan_code
      WHERE um.user_id = ?
    `).get(userId) as UserMembership | undefined;
  }

  activate(userId: string, planCode: string, months: number): UserMembership {
    const now = new Date();
    const expires = new Date(now);
    expires.setUTCMonth(expires.getUTCMonth() + months);

    this.database.prepare(`
      INSERT INTO user_memberships
        (user_id, plan_code, status, started_at, expires_at, updated_at)
      VALUES (?, ?, 'ACTIVE', ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        plan_code = excluded.plan_code,
        status = 'ACTIVE',
        started_at = excluded.started_at,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    `).run(userId, planCode, now.toISOString(), expires.toISOString(), now.toISOString());

    return this.findForUser(userId)!;
  }
}

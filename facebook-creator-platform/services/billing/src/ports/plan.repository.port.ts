import type { Plan } from '../entities/plan.entity';

/**
 * Port (outbound): reads plan reference data from `billing.plans`.
 */
export abstract class IPlanRepository {
  /**
   * Finds a plan by its short code (free / pro / team).
   *
   * @param code - The plan code to look up.
   * @returns The matching Plan, or `null` if none exists.
   */
  abstract findByCode(code: string): Promise<Plan | null>;
}

/**
 * Registry loader. PURE, declarative data only.
 */
import type { ChangeTypeRegistration } from "./types";

export class ChangeTypeRegistry {
  private readonly map: Map<string, ChangeTypeRegistration>;

  constructor(registrations: ChangeTypeRegistration[] = []) {
    this.map = new Map(registrations.map((r) => [r.changeType, r]));
  }

  register(registration: ChangeTypeRegistration): void {
    this.map.set(registration.changeType, registration);
  }

  get(changeType: string): ChangeTypeRegistration | undefined {
    return this.map.get(changeType);
  }

  has(changeType: string): boolean {
    return this.map.has(changeType);
  }

  list(): ChangeTypeRegistration[] {
    return [...this.map.values()].sort((a, b) => a.changeType.localeCompare(b.changeType));
  }
}

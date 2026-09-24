import { describe, expect, it, vi } from "vitest";

import type { ManagedUser } from "../queries";
import { filterUsers, paginateUsers } from "./user-list";

vi.mock("./user-actions", () => ({ UserActions: () => null }));

const users: ManagedUser[] = Array.from({ length: 11 }, (_, index) => ({
  id: `user-${index}`,
  displayName: index === 0 ? "Ana Admin" : `Persona ${index}`,
  email: `persona${index}@example.com`,
  role: index === 0 ? "admin" : index % 2 === 0 ? "employee" : "attention",
  isActive: index !== 10,
  mustChangePassword: false,
}));

describe("UserList filters and pagination", () => {
  it("filters by role and active status", () => {
    const result = filterUsers(users, "", "employee", "active");

    expect(result.map((user) => user.displayName)).toEqual(["Persona 2", "Persona 4", "Persona 6", "Persona 8"]);
  });

  it("paginates filtered users and supports a reset search result", () => {
    expect(paginateUsers(users, 2).map((user) => user.displayName)).toEqual(["Persona 10"]);
    expect(filterUsers(users, "Ana", "all", "all").map((user) => user.displayName)).toEqual(["Ana Admin"]);
  });
});

import { describe, expect, it } from "vitest";

import { Route as AlertRedirect } from "@/routes/_authenticated/alerts/$alertId";
import { Route as AlertsRedirect } from "@/routes/_authenticated/alerts/index";
import { Route as HomeRoute } from "@/routes/_authenticated/index";

type Validate = (search: Record<string, unknown>) => { alert?: number };
type BeforeLoad = (ctx: { params: Record<string, string> }) => unknown;

function thrown(fn: () => unknown): { options?: { to?: string; search?: unknown } } {
  try {
    fn();
  } catch (e) {
    return e as { options?: { to?: string; search?: unknown } };
  }
  throw new Error("expected a redirect");
}

describe("Home route search", () => {
  const validate = HomeRoute.options.validateSearch as unknown as Validate;

  it("accepts a positive integer alert id", () => {
    expect(validate({ alert: "42" })).toEqual({ alert: 42 });
    expect(validate({ alert: 7 })).toEqual({ alert: 7 });
  });

  it("drops invalid alert ids", () => {
    expect(validate({ alert: "abc" })).toEqual({});
    expect(validate({ alert: "-1" })).toEqual({});
    expect(validate({})).toEqual({});
  });
});

describe("v3 alert redirects", () => {
  it("/alerts/$alertId redirects to Home with the slide-over open", () => {
    const beforeLoad = AlertRedirect.options.beforeLoad as unknown as BeforeLoad;
    const redirect = thrown(() => beforeLoad({ params: { alertId: "12" } }));
    expect(redirect.options).toMatchObject({ to: "/", search: { alert: 12 } });
  });

  it("/alerts redirects to Home", () => {
    const beforeLoad = AlertsRedirect.options.beforeLoad as unknown as BeforeLoad;
    const redirect = thrown(() => beforeLoad({ params: {} }));
    expect(redirect.options).toMatchObject({ to: "/" });
  });
});

import { describe, expect, it } from "vitest";

import { Route as AlertRedirect } from "@/routes/_authenticated/alerts/$alertId";
import { Route as AlertsRedirect } from "@/routes/_authenticated/alerts/index";
import { Route as HomeRoute } from "@/routes/_authenticated/index";

type Validate = (search: Record<string, unknown>) => Record<string, unknown>;
type BeforeLoad = (ctx: {
  params: Record<string, string>;
  search?: Record<string, unknown>;
}) => unknown;

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

  it("keeps the queue filters next to the alert id", () => {
    expect(validate({ alert: "3", search: "db01", network_id: "2" })).toEqual({
      alert: 3,
      search: "db01",
      network_id: 2,
    });
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
    const redirect = thrown(() => beforeLoad({ params: {}, search: {} }));
    expect(redirect.options).toMatchObject({ to: "/", search: {} });
  });

  it("/alerts?search=&source= keeps the search on Home and drops the source", () => {
    const validate = AlertsRedirect.options.validateSearch as unknown as Validate;
    const search = validate({ search: "10.0.0.5", source: "ssh" });
    expect(search).toEqual({ search: "10.0.0.5" });
    const beforeLoad = AlertsRedirect.options.beforeLoad as unknown as BeforeLoad;
    const redirect = thrown(() => beforeLoad({ params: {}, search }));
    expect(redirect.options).toMatchObject({ to: "/", search: { search: "10.0.0.5" } });
  });
});

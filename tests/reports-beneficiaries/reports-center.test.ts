/**
 * Reports center visibility helpers + ReportsCenter.tsx source contracts.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  REPORT_CATALOG_ENTRIES,
  endUserCatalogEntries,
  findByCode,
  isHiddenFromEndUserCatalog,
  isReportInPreparation,
  isReportOpenable,
  openableReports,
} from "../../src/lib/reports/catalog";

const CENTER_SRC = readFileSync(
  fileURLToPath(new URL("../../src/components/reports-center/ReportsCenter.tsx", import.meta.url)),
  "utf8",
);

describe("endUserCatalogEntries hides BLOCKED / NOT_ACTIVATED", () => {
  test("admin end-user catalog excludes blocked and not-activated statuses", () => {
    const entries = endUserCatalogEntries(REPORT_CATALOG_ENTRIES, ["admin"]);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.status).not.toBe("BLOCKED");
      expect(entry.status).not.toBe("NOT_ACTIVATED");
      expect(isHiddenFromEndUserCatalog(entry)).toBe(false);
    }
  });

  test("blocked catalog entries are marked hidden from end-user catalog", () => {
    const blocked = REPORT_CATALOG_ENTRIES.filter((e) => e.status === "BLOCKED");
    expect(blocked.length).toBeGreaterThan(0);
    for (const entry of blocked) {
      expect(isHiddenFromEndUserCatalog(entry)).toBe(true);
      expect(endUserCatalogEntries([entry], entry.required_role)).toHaveLength(0);
    }
  });
});

describe("isReportOpenable only LIVE/DATA_DEPENDENT with route", () => {
  test("LIVE hubs with routes are openable", () => {
    const hub = findByCode(REPORT_CATALOG_ENTRIES, "HUB-FACULTY-REPORTS")!;
    expect(hub.status).toBe("LIVE");
    expect(hub.route).not.toBeNull();
    expect(isReportOpenable(hub)).toBe(true);
  });

  test("BLOCKED is never openable", () => {
    const blocked = REPORT_CATALOG_ENTRIES.filter((e) => e.status === "BLOCKED");
    for (const entry of blocked) {
      expect(isReportOpenable(entry)).toBe(false);
    }
  });

  test("SOURCE_READY / UNDER_DEVELOPMENT are preparation, not openable", () => {
    const prep = REPORT_CATALOG_ENTRIES.filter(
      (e) => e.status === "SOURCE_READY" || e.status === "UNDER_DEVELOPMENT",
    );
    expect(prep.length).toBeGreaterThan(0);
    for (const entry of prep) {
      expect(isReportInPreparation(entry)).toBe(true);
      expect(isReportOpenable(entry)).toBe(false);
    }
  });

  test("openableReports never includes BLOCKED codes for admin", () => {
    const openable = openableReports(REPORT_CATALOG_ENTRIES, ["admin"]);
    for (const entry of openable) {
      expect(["LIVE", "DATA_DEPENDENT"]).toContain(entry.status);
      expect(entry.route).not.toBeNull();
      expect(entry.status).not.toBe("BLOCKED");
    }
  });
});

describe("ReportsCenter.tsx source contracts", () => {
  test("favorites use localStorage key portal.reports.favorites.v1", () => {
    expect(CENTER_SRC).toContain('FAVORITES_KEY = "portal.reports.favorites.v1"');
    expect(CENTER_SRC).toContain("localStorage.getItem(FAVORITES_KEY)");
    expect(CENTER_SRC).toContain("localStorage.setItem(FAVORITES_KEY");
    expect(CENTER_SRC).toContain("persistFavorites");
    expect(CENTER_SRC).toContain("toggleFavorite");
  });

  test("showPreparation filters preparation entries when false", () => {
    expect(CENTER_SRC).toContain("showPreparation = true");
    expect(CENTER_SRC).toContain("endUserCatalogEntries");
    expect(CENTER_SRC).toContain("isReportInPreparation");
    expect(CENTER_SRC).toContain(
      "base.filter((e) => !isReportInPreparation(e))",
    );
  });

  test("openability uses isReportOpenable (never treats BLOCKED as openable)", () => {
    expect(CENTER_SRC).toContain("isReportOpenable");
    expect(CENTER_SRC).toContain("Hides BLOCKED/NOT_ACTIVATED");
  });
});

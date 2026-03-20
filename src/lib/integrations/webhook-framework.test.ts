import { describe, expect, it } from "vitest";
import {
  decideWebhookImportDisposition,
  matchCampaignFromMappings,
  matchDonorFromCandidates
} from "./webhook-framework";

describe("matchCampaignFromMappings", () => {
  it("prioritizes exact external page id mapping", () => {
    const result = matchCampaignFromMappings(
      {
        externalPageId: "PAGE_123",
        externalPageName: "General Fund"
      },
      [
        {
          crmCampaignId: "campaign-a",
          externalPageId: "PAGE_123",
          externalPageName: "Different Name",
          isActive: true
        },
        {
          crmCampaignId: "campaign-b",
          externalPageName: "General Fund",
          isActive: true
        }
      ]
    );

    expect(result.matchedCampaignId).toBe("campaign-a");
    expect(result.rule).toBe("mapping_external_page_id");
    expect(result.confidence).toBe(100);
  });

  it("returns ambiguous when multiple mappings match", () => {
    const result = matchCampaignFromMappings(
      {
        externalPageName: "Annual Fund"
      },
      [
        { crmCampaignId: "campaign-a", externalPageName: "Annual Fund", isActive: true },
        { crmCampaignId: "campaign-b", externalPageName: "Annual Fund", isActive: true }
      ]
    );

    expect(result.matchedCampaignId).toBeNull();
    expect(result.rule).toBe("ambiguous");
  });
});

describe("matchDonorFromCandidates", () => {
  it("matches by external donor reference first", () => {
    const result = matchDonorFromCandidates(
      {
        externalDonorReference: "cust-44",
        email: "person@example.org"
      },
      [
        {
          id: "contact-1",
          email: "other@example.org",
          externalReferences: ["cust-44"]
        },
        {
          id: "contact-2",
          email: "person@example.org",
          externalReferences: []
        }
      ]
    );

    expect(result.matchedDonorId).toBe("contact-1");
    expect(result.rule).toBe("external_donor_id");
    expect(result.confidence).toBe(100);
  });

  it("returns ambiguous for duplicate email candidates", () => {
    const result = matchDonorFromCandidates(
      {
        email: "duplicate@example.org"
      },
      [
        { id: "contact-1", email: "duplicate@example.org" },
        { id: "contact-2", email: "duplicate@example.org" }
      ]
    );

    expect(result.matchedDonorId).toBeNull();
    expect(result.rule).toBe("ambiguous");
  });
});

describe("decideWebhookImportDisposition", () => {
  const settings = {
    autoAcceptDonorConfidence: 95,
    autoAcceptCampaignConfidence: 100,
    autoCreateUnmatchedDonor: false,
    blockLowConfidenceCampaign: true,
    holdAmbiguousDonorMatches: true
  };

  it("requires review when campaign confidence is below threshold", () => {
    const result = decideWebhookImportDisposition({
      campaignMatch: {
        matchedCampaignId: "campaign-1",
        confidence: 90,
        rule: "mapping_external_page_name",
        reason: "name match"
      },
      donorMatch: {
        matchedDonorId: "contact-1",
        confidence: 100,
        rule: "external_donor_id",
        reason: "exact external id"
      },
      settings
    });

    expect(result.shouldAutoAccept).toBe(false);
    expect(result.reviewReason).toContain("Campaign confidence");
  });

  it("allows auto accept with donor auto-create enabled", () => {
    const result = decideWebhookImportDisposition({
      campaignMatch: {
        matchedCampaignId: "campaign-1",
        confidence: 100,
        rule: "mapping_external_page_id",
        reason: "exact page id"
      },
      donorMatch: {
        matchedDonorId: null,
        confidence: 0,
        rule: "none",
        reason: "no donor"
      },
      settings: {
        ...settings,
        autoCreateUnmatchedDonor: true
      }
    });

    expect(result.shouldAutoAccept).toBe(true);
    expect(result.shouldCreateDonor).toBe(true);
  });
});

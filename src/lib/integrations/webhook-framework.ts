export type CampaignMatchRule =
  | "mapping_external_page_id"
  | "mapping_external_page_key"
  | "mapping_external_campaign_reference"
  | "mapping_external_page_name"
  | "none"
  | "ambiguous";

export type DonorMatchRule =
  | "external_donor_id"
  | "email"
  | "email_last_name"
  | "first_last_zip"
  | "first_last_phone"
  | "none"
  | "ambiguous";

export type CampaignMatchResult = {
  matchedCampaignId: string | null;
  confidence: number;
  rule: CampaignMatchRule;
  reason: string;
};

export type DonorMatchResult = {
  matchedDonorId: string | null;
  confidence: number;
  rule: DonorMatchRule;
  reason: string;
};

export type CampaignMatchInput = {
  externalPageId?: string | null;
  externalPageKey?: string | null;
  externalCampaignReference?: string | null;
  externalPageName?: string | null;
};

export type CampaignMappingCandidate = {
  crmCampaignId: string;
  externalPageId?: string | null;
  externalPageKey?: string | null;
  externalPageName?: string | null;
  isActive?: boolean;
};

export type DonorIdentityInput = {
  externalDonorReference?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  postalCode?: string | null;
  phone?: string | null;
};

export type DonorCandidate = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  externalReferences?: string[];
};

export type WebhookAutomationSettings = {
  autoAcceptDonorConfidence: number;
  autoAcceptCampaignConfidence: number;
  autoCreateUnmatchedDonor: boolean;
  blockLowConfidenceCampaign: boolean;
  holdAmbiguousDonorMatches: boolean;
};

export type WebhookImportDecision = {
  shouldAutoAccept: boolean;
  shouldCreateDonor: boolean;
  reviewReason: string | null;
};

export function normalizeLooseText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

export function normalizeEmail(value: string | null | undefined) {
  return normalizeLooseText(value);
}

export function normalizePhone(value: string | null | undefined) {
  return String(value ?? "").replace(/\D+/g, "");
}

export function normalizePostalCode(value: string | null | undefined) {
  return normalizeLooseText(value).replace(/\s+/g, "");
}

function uniqueSingleMatch(values: string[]) {
  const unique = Array.from(new Set(values.filter(Boolean)));
  if (unique.length === 1) return { matchId: unique[0], ambiguous: false };
  if (unique.length > 1) return { matchId: null, ambiguous: true };
  return { matchId: null, ambiguous: false };
}

export function matchCampaignFromMappings(
  input: CampaignMatchInput,
  candidates: CampaignMappingCandidate[]
): CampaignMatchResult {
  const activeCandidates = candidates.filter((candidate) => candidate.isActive !== false);
  const externalPageId = normalizeLooseText(input.externalPageId);
  const externalPageKey = normalizeLooseText(input.externalPageKey);
  const externalCampaignReference = normalizeLooseText(input.externalCampaignReference);
  const externalPageName = normalizeLooseText(input.externalPageName);

  if (externalPageId) {
    const matched = uniqueSingleMatch(
      activeCandidates
        .filter((candidate) => normalizeLooseText(candidate.externalPageId) === externalPageId)
        .map((candidate) => candidate.crmCampaignId)
    );
    if (matched.matchId) {
      return {
        matchedCampaignId: matched.matchId,
        confidence: 100,
        rule: "mapping_external_page_id",
        reason: "Matched by mapped external page ID."
      };
    }
    if (matched.ambiguous) {
      return {
        matchedCampaignId: null,
        confidence: 0,
        rule: "ambiguous",
        reason: "Multiple campaign mappings matched this external page ID."
      };
    }
  }

  if (externalPageKey) {
    const matched = uniqueSingleMatch(
      activeCandidates
        .filter((candidate) => normalizeLooseText(candidate.externalPageKey) === externalPageKey)
        .map((candidate) => candidate.crmCampaignId)
    );
    if (matched.matchId) {
      return {
        matchedCampaignId: matched.matchId,
        confidence: 97,
        rule: "mapping_external_page_key",
        reason: "Matched by mapped external page key."
      };
    }
    if (matched.ambiguous) {
      return {
        matchedCampaignId: null,
        confidence: 0,
        rule: "ambiguous",
        reason: "Multiple campaign mappings matched this external page key."
      };
    }
  }

  if (externalCampaignReference) {
    const matched = uniqueSingleMatch(
      activeCandidates
        .filter((candidate) => normalizeLooseText(candidate.externalPageKey) === externalCampaignReference)
        .map((candidate) => candidate.crmCampaignId)
    );
    if (matched.matchId) {
      return {
        matchedCampaignId: matched.matchId,
        confidence: 95,
        rule: "mapping_external_campaign_reference",
        reason: "Matched by external campaign reference."
      };
    }
    if (matched.ambiguous) {
      return {
        matchedCampaignId: null,
        confidence: 0,
        rule: "ambiguous",
        reason: "Multiple campaign mappings matched this campaign reference."
      };
    }
  }

  if (externalPageName) {
    const matched = uniqueSingleMatch(
      activeCandidates
        .filter((candidate) => normalizeLooseText(candidate.externalPageName) === externalPageName)
        .map((candidate) => candidate.crmCampaignId)
    );
    if (matched.matchId) {
      return {
        matchedCampaignId: matched.matchId,
        confidence: 90,
        rule: "mapping_external_page_name",
        reason: "Matched by external page name."
      };
    }
    if (matched.ambiguous) {
      return {
        matchedCampaignId: null,
        confidence: 0,
        rule: "ambiguous",
        reason: "Multiple campaign mappings matched this page name."
      };
    }
  }

  return {
    matchedCampaignId: null,
    confidence: 0,
    rule: "none",
    reason: "No reliable campaign mapping match found."
  };
}

export function matchDonorFromCandidates(
  input: DonorIdentityInput,
  candidates: DonorCandidate[]
): DonorMatchResult {
  const externalDonorReference = normalizeLooseText(input.externalDonorReference);
  const email = normalizeEmail(input.email);
  const firstName = normalizeLooseText(input.firstName);
  const lastName = normalizeLooseText(input.lastName);
  const postalCode = normalizePostalCode(input.postalCode);
  const phone = normalizePhone(input.phone);

  if (externalDonorReference) {
    const match = uniqueSingleMatch(
      candidates
        .filter((candidate) =>
          (candidate.externalReferences ?? []).some(
            (reference) => normalizeLooseText(reference) === externalDonorReference
          )
        )
        .map((candidate) => candidate.id)
    );
    if (match.matchId) {
      return {
        matchedDonorId: match.matchId,
        confidence: 100,
        rule: "external_donor_id",
        reason: "Matched by exact external donor reference."
      };
    }
    if (match.ambiguous) {
      return {
        matchedDonorId: null,
        confidence: 0,
        rule: "ambiguous",
        reason: "Multiple donors share this external donor reference."
      };
    }
  }

  if (email) {
    const emailMatches = uniqueSingleMatch(
      candidates
        .filter((candidate) => normalizeEmail(candidate.email) === email)
        .map((candidate) => candidate.id)
    );
    if (emailMatches.matchId) {
      return {
        matchedDonorId: emailMatches.matchId,
        confidence: 97,
        rule: "email",
        reason: "Matched by exact email."
      };
    }
    if (emailMatches.ambiguous) {
      return {
        matchedDonorId: null,
        confidence: 0,
        rule: "ambiguous",
        reason: "Multiple donors share this email address."
      };
    }
  }

  if (email && lastName) {
    const emailLastMatches = uniqueSingleMatch(
      candidates
        .filter(
          (candidate) =>
            normalizeEmail(candidate.email) === email &&
            normalizeLooseText(candidate.lastName) === lastName
        )
        .map((candidate) => candidate.id)
    );
    if (emailLastMatches.matchId) {
      return {
        matchedDonorId: emailLastMatches.matchId,
        confidence: 98,
        rule: "email_last_name",
        reason: "Matched by exact email + last name."
      };
    }
    if (emailLastMatches.ambiguous) {
      return {
        matchedDonorId: null,
        confidence: 0,
        rule: "ambiguous",
        reason: "Multiple donors matched email + last name."
      };
    }
  }

  if (firstName && lastName && postalCode) {
    const nameZipMatches = uniqueSingleMatch(
      candidates
        .filter(
          (candidate) =>
            normalizeLooseText(candidate.firstName) === firstName &&
            normalizeLooseText(candidate.lastName) === lastName &&
            normalizePostalCode(candidate.postalCode) === postalCode
        )
        .map((candidate) => candidate.id)
    );
    if (nameZipMatches.matchId) {
      return {
        matchedDonorId: nameZipMatches.matchId,
        confidence: 92,
        rule: "first_last_zip",
        reason: "Matched by first name + last name + postal code."
      };
    }
    if (nameZipMatches.ambiguous) {
      return {
        matchedDonorId: null,
        confidence: 0,
        rule: "ambiguous",
        reason: "Multiple donors matched first name + last name + postal code."
      };
    }
  }

  if (firstName && lastName && phone) {
    const namePhoneMatches = uniqueSingleMatch(
      candidates
        .filter(
          (candidate) =>
            normalizeLooseText(candidate.firstName) === firstName &&
            normalizeLooseText(candidate.lastName) === lastName &&
            normalizePhone(candidate.phone) === phone
        )
        .map((candidate) => candidate.id)
    );
    if (namePhoneMatches.matchId) {
      return {
        matchedDonorId: namePhoneMatches.matchId,
        confidence: 90,
        rule: "first_last_phone",
        reason: "Matched by first name + last name + phone."
      };
    }
    if (namePhoneMatches.ambiguous) {
      return {
        matchedDonorId: null,
        confidence: 0,
        rule: "ambiguous",
        reason: "Multiple donors matched first name + last name + phone."
      };
    }
  }

  return {
    matchedDonorId: null,
    confidence: 0,
    rule: "none",
    reason: "No reliable donor match found."
  };
}

export function decideWebhookImportDisposition(input: {
  campaignMatch: CampaignMatchResult;
  donorMatch: DonorMatchResult;
  settings: WebhookAutomationSettings;
}) {
  const { campaignMatch, donorMatch, settings } = input;

  if (!campaignMatch.matchedCampaignId) {
    return {
      shouldAutoAccept: false,
      shouldCreateDonor: false,
      reviewReason: "Campaign match is missing."
    } satisfies WebhookImportDecision;
  }

  if (
    settings.blockLowConfidenceCampaign &&
    campaignMatch.confidence < settings.autoAcceptCampaignConfidence
  ) {
    return {
      shouldAutoAccept: false,
      shouldCreateDonor: false,
      reviewReason: `Campaign confidence (${campaignMatch.confidence}) is below auto-accept threshold.`
    } satisfies WebhookImportDecision;
  }

  if (donorMatch.rule === "ambiguous" && settings.holdAmbiguousDonorMatches) {
    return {
      shouldAutoAccept: false,
      shouldCreateDonor: false,
      reviewReason: "Donor match is ambiguous."
    } satisfies WebhookImportDecision;
  }

  if (donorMatch.matchedDonorId) {
    if (donorMatch.confidence >= settings.autoAcceptDonorConfidence) {
      return {
        shouldAutoAccept: true,
        shouldCreateDonor: false,
        reviewReason: null
      } satisfies WebhookImportDecision;
    }
    return {
      shouldAutoAccept: false,
      shouldCreateDonor: false,
      reviewReason: `Donor confidence (${donorMatch.confidence}) is below auto-accept threshold.`
    } satisfies WebhookImportDecision;
  }

  if (settings.autoCreateUnmatchedDonor) {
    return {
      shouldAutoAccept: true,
      shouldCreateDonor: true,
      reviewReason: null
    } satisfies WebhookImportDecision;
  }

  return {
    shouldAutoAccept: false,
    shouldCreateDonor: false,
    reviewReason: "No donor match and auto-create is disabled."
  } satisfies WebhookImportDecision;
}

import { describe, it, expect } from "vitest";
import {
    getCommitIcon,
    getColor,
    getMergeableIcon,
    getMergeableState,
    getPullRequestStateIcon,
    getStatesFilter,
    getEndpointUrl,
} from "../src/utils";
import { createMockPullRequest, SAMPLE_PULL_REQUESTS } from "./fixtures";

describe("Utils - Icon Functions", () => {
    it("getCommitIcon returns check for SUCCESS", () => {
        expect(getCommitIcon({ state: "SUCCESS" })).toBe("$(check)");
    });

    it("getCommitIcon returns kebab-horizontal for PENDING", () => {
        expect(getCommitIcon({ state: "PENDING" })).toBe("$(kebab-horizontal)");
    });

    it("getCommitIcon returns tools for FAILURE", () => {
        expect(getCommitIcon({ state: "FAILURE" })).toBe("$(tools)");
    });

    it("getCommitIcon returns undefined for null", () => {
        expect(getCommitIcon(null)).toBeUndefined();
    });

    it("getCommitIcon returns undefined for null state", () => {
        expect(getCommitIcon({ state: null })).toBeUndefined();
    });

    it("getMergeableIcon returns git-merge for MERGEABLE", () => {
        expect(getMergeableIcon("MERGEABLE")).toBe("$(git-merge)");
    });

    it("getMergeableIcon returns question for UNKNOWN", () => {
        expect(getMergeableIcon("UNKNOWN")).toBe("$(question)");
    });

    it("getMergeableIcon returns alert for CONFLICTING", () => {
        expect(getMergeableIcon("CONFLICTING")).toBe("$(alert)");
    });

    it("getPullRequestStateIcon returns git-merge for MERGED", () => {
        expect(getPullRequestStateIcon("MERGED")).toBe("$(git-merge)");
    });

    it("getPullRequestStateIcon returns git-pull-request for OPEN", () => {
        expect(getPullRequestStateIcon("OPEN")).toBe("$(git-pull-request)");
    });

    it("getPullRequestStateIcon returns x for CLOSED", () => {
        expect(getPullRequestStateIcon("CLOSED")).toBe("$(x)");
    });
});

describe("Utils - Color Functions", () => {
    it("getColor returns purple for MERGED", () => {
        expect(getColor("MERGED")).toBe("rgba(190, 154, 240, 1)");
    });

    it("getColor returns green for MERGEABLE", () => {
        expect(getColor("MERGEABLE")).toBe("rgba(128, 211, 148, 1)");
    });

    it("getColor returns dark for CLOSED", () => {
        expect(getColor("CLOSED")).toBe("rgba(58, 62, 62, 1)");
    });

    it("getColor returns red for FAILURE", () => {
        expect(getColor("FAILURE")).toBe("rgba(255, 110, 110, 1)");
    });

    it("getColor returns gray for OPEN (default)", () => {
        expect(getColor("OPEN")).toBe("rgba(144, 155, 155, 1)");
    });

    it("getColor uses custom colors when provided", () => {
        const customColors = {
            merged: "#ff0000",
            mergeable: "#00ff00",
        };
        expect(getColor("MERGED", customColors)).toBe("#ff0000");
        expect(getColor("MERGEABLE", customColors)).toBe("#00ff00");
    });
});

describe("Utils - Mergeable State", () => {
    it("getMergeableState returns MERGED for merged PR", () => {
        const pr = SAMPLE_PULL_REQUESTS.merged;
        expect(getMergeableState(pr, true)).toBe("MERGED");
    });

    it("getMergeableState returns CLOSED for closed PR", () => {
        const pr = SAMPLE_PULL_REQUESTS.closed;
        expect(getMergeableState(pr, true)).toBe("CLOSED");
    });

    it("getMergeableState returns MERGEABLE when all checks pass", () => {
        const pr = createMockPullRequest({
            state: "OPEN",
            mergeable: "MERGEABLE",
            commits: { nodes: [{ commit: { status: { state: "SUCCESS" } } }] },
            potentialMergeCommit: { status: null },
        });
        expect(getMergeableState(pr, true)).toBe("MERGEABLE");
    });

    it("getMergeableState returns FAILURE for conflicting PR", () => {
        const pr = SAMPLE_PULL_REQUESTS.openWithConflicts;
        expect(getMergeableState(pr, true)).toBe("FAILURE");
    });

    it("getMergeableState returns FAILURE for failed checks", () => {
        const pr = SAMPLE_PULL_REQUESTS.openWithFailedChecks;
        expect(getMergeableState(pr, true)).toBe("FAILURE");
    });

    it("getMergeableState returns FAILURE when reviews not passing", () => {
        const pr = SAMPLE_PULL_REQUESTS.openMergeable;
        expect(getMergeableState(pr, false)).toBe("FAILURE");
    });

    it("getMergeableState returns OPEN for pending state", () => {
        const pr = SAMPLE_PULL_REQUESTS.openPending;
        expect(getMergeableState(pr, true)).toBe("OPEN");
    });
});

describe("Utils - States Filter", () => {
    it("getStatesFilter returns empty string when showing all", () => {
        expect(getStatesFilter(true, true)).toBe("");
    });

    it("getStatesFilter returns OPEN only by default", () => {
        expect(getStatesFilter(false, false)).toBe("states: [OPEN]");
    });

    it("getStatesFilter includes CLOSED when showClosed is true", () => {
        expect(getStatesFilter(false, true)).toBe("states: [OPEN CLOSED]");
    });

    it("getStatesFilter includes MERGED when showMerged is true", () => {
        expect(getStatesFilter(true, false)).toBe("states: [OPEN MERGED]");
    });
});

describe("Utils - Endpoint URL", () => {
    it("getEndpointUrl returns default GitHub API", () => {
        expect(getEndpointUrl(null)).toBe("https://api.github.com/graphql");
        expect(getEndpointUrl(undefined)).toBe("https://api.github.com/graphql");
    });

    it("getEndpointUrl returns enterprise URL with /api/graphql", () => {
        expect(getEndpointUrl("https://github.mycompany.com")).toBe(
            "https://github.mycompany.com/api/graphql",
        );
    });
});

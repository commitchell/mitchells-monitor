import { describe, it, expect } from "vitest";
import {
    getPullRequestStatus,
    getPullRequestStatusIcon,
    getPullRequestColour,
    getStatesFilter,
    getEndpointUrl,
    parseGitHubRepoFromRemoteUrl,
} from "../src/utils";
import { SAMPLE_PULL_REQUESTS } from "./fixtures";

describe("Utils - Pull Request Status Functions", () => {
    it("getPullRequestStatus returns MERGED for merged PR", () => {
        const pr = SAMPLE_PULL_REQUESTS.merged;
        expect(getPullRequestStatus(pr)).toEqual({ status: "MERGED" });
    });

    it("getPullRequestStatus returns CLOSED for closed PR", () => {
        const pr = SAMPLE_PULL_REQUESTS.closed;
        expect(getPullRequestStatus(pr)).toEqual({ status: "CLOSED" });
    });

    it("getPullRequestStatus returns object with blocking reasons", () => {
        const pr = SAMPLE_PULL_REQUESTS.openWithConflicts;
        const status = getPullRequestStatus(pr);
        expect(status).toHaveProperty("status", "OPEN");
        expect(status).toHaveProperty("blockingReasons");
        expect(status.blockingReasons).toContain("HAS_CONFLICTS");
    });

    it("getPullRequestStatusIcon returns correct icon for MERGEABLE", () => {
        expect(getPullRequestStatusIcon({ status: "MERGEABLE" })).toBe("$(pass-filled)");
    });

    it("getPullRequestStatusIcon returns correct icon for CLOSED", () => {
        expect(getPullRequestStatusIcon({ status: "CLOSED" })).toBe("$(git-pull-request-closed)");
    });

    it("getPullRequestStatusIcon returns correct icon for MERGED", () => {
        expect(getPullRequestStatusIcon({ status: "MERGED" })).toBe("$(git-merge)");
    });

    it("getPullRequestColour returns correct color for MERGEABLE", () => {
        expect(getPullRequestColour({ status: "MERGEABLE" })).toBe("rgba(77, 237, 186, 1)");
    });

    it("getPullRequestColour returns correct color for CLOSED", () => {
        expect(getPullRequestColour({ status: "CLOSED" })).toBe("rgba(144, 155, 155, 1)");
    });

    it("getPullRequestColour returns correct color for MERGED", () => {
        expect(getPullRequestColour({ status: "MERGED" })).toBe("rgba(214, 172, 255, 1)");
    });
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

describe("Utils - parseGitHubRepoFromRemoteUrl", () => {
    it("parses SSH URL format", () => {
        const result = parseGitHubRepoFromRemoteUrl("git@github.com:owner/repo.git");
        expect(result).toEqual({ owner: "owner", name: "repo" });
    });

    it("parses SSH URL without .git suffix", () => {
        const result = parseGitHubRepoFromRemoteUrl("git@github.com:owner/repo");
        expect(result).toEqual({ owner: "owner", name: "repo" });
    });

    it("parses HTTPS URL format", () => {
        const result = parseGitHubRepoFromRemoteUrl("https://github.com/owner/repo.git");
        expect(result).toEqual({ owner: "owner", name: "repo" });
    });

    it("parses HTTPS URL without .git suffix", () => {
        const result = parseGitHubRepoFromRemoteUrl("https://github.com/owner/repo");
        expect(result).toEqual({ owner: "owner", name: "repo" });
    });

    it("parses GitHub Enterprise SSH URL", () => {
        const result = parseGitHubRepoFromRemoteUrl("git@github.mycompany.com:team/project.git");
        expect(result).toEqual({ owner: "team", name: "project" });
    });

    it("parses GitHub Enterprise HTTPS URL", () => {
        const result = parseGitHubRepoFromRemoteUrl(
            "https://github.mycompany.com/team/project.git",
        );
        expect(result).toEqual({ owner: "team", name: "project" });
    });

    it("returns null for invalid URLs", () => {
        expect(parseGitHubRepoFromRemoteUrl("not-a-url")).toBeNull();
        expect(parseGitHubRepoFromRemoteUrl("")).toBeNull();
    });

    it("handles repos with hyphens and underscores", () => {
        const result = parseGitHubRepoFromRemoteUrl("git@github.com:my-org/my_repo-name.git");
        expect(result).toEqual({ owner: "my-org", name: "my_repo-name" });
    });
});

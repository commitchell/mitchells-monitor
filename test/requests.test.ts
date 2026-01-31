import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadPullRequests } from "../src/requests";
import {
    createViewerPullRequestsResponse,
    createRepositoryPullRequestsResponse,
    SAMPLE_PULL_REQUESTS,
} from "./fixtures";

// Mock vscode module
vi.mock("vscode", () => ({
    window: {
        showWarningMessage: vi.fn(),
        showErrorMessage: vi.fn(),
    },
}));

// Import after mocking
import * as vscode from "vscode";

describe("Requests - loadPullRequests", () => {
    const mockShowWarning = vscode.window.showWarningMessage as ReturnType<typeof vi.fn>;
    const mockShowError = vscode.window.showErrorMessage as ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const defaultOptions = {
        useRepositoryMode: false,
        showMerged: false,
        showClosed: false,
        repository: undefined,
        showError: false,
        count: 6,
        url: "https://api.github.com/graphql",
        allowUnsafeSSL: false,
    };

    it("returns error when no token provided", async () => {
        const result = await loadPullRequests(undefined, defaultOptions);

        expect(result.status).toBe("error");
        expect(mockShowWarning).toHaveBeenCalledOnce();
    });

    it("returns error when token is empty string", async () => {
        const result = await loadPullRequests("", defaultOptions);

        expect(result.status).toBe("error");
    });

    it("returns pull requests on successful response - viewer mode", async () => {
        const mockPRs = [SAMPLE_PULL_REQUESTS.openMergeable];
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue({
            status: 200,
            json: async () => createViewerPullRequestsResponse(mockPRs),
        } as Response);

        const result = await loadPullRequests("valid-token", defaultOptions);

        expect(result.status).toBe("ok");
        expect(result.data?.length).toBe(1);
        expect(result.data?.[0].number).toBe(1);
    });

    it("returns pull requests on successful response - repository mode", async () => {
        const mockPRs = [SAMPLE_PULL_REQUESTS.openMergeable];
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue({
            status: 200,
            json: async () => createRepositoryPullRequestsResponse(mockPRs),
        } as Response);

        const result = await loadPullRequests("valid-token", {
            ...defaultOptions,
            useRepositoryMode: true,
            repository: {
                nameWithOwner: "test-owner/test-repo",
                owner: "test-owner",
                name: "test-repo",
            },
        });

        expect(result.status).toBe("ok");
        expect(result.data?.length).toBe(1);
    });

    it("returns error when repository mode but no repository specified", async () => {
        const result = await loadPullRequests("valid-token", {
            ...defaultOptions,
            useRepositoryMode: true,
            repository: undefined,
        });

        expect(result.status).toBe("error");
    });

    it("returns error with code 401 on unauthorized response", async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue({
            status: 401,
        } as Response);

        const result = await loadPullRequests("invalid-token", defaultOptions);

        expect(result.status).toBe("error");
        expect(result.code).toBe(401);
        expect(mockShowError).toHaveBeenCalledOnce();
    });

    it("returns error with code 401 on forbidden response", async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue({
            status: 403,
        } as Response);

        const result = await loadPullRequests("expired-token", defaultOptions);

        expect(result.status).toBe("error");
        expect(result.code).toBe(401);
    });

    it("returns error with status code on other HTTP errors", async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue({
            status: 500,
        } as Response);

        const result = await loadPullRequests("valid-token", defaultOptions);

        expect(result.status).toBe("error");
        expect(result.code).toBe(500);
    });

    it("returns error on network failure", async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockRejectedValue(new Error("Network error"));

        const result = await loadPullRequests("valid-token", {
            ...defaultOptions,
            showError: true,
        });

        expect(result.status).toBe("error");
        expect(mockShowError).toHaveBeenCalledOnce();
    });

    it("returns multiple pull requests correctly", async () => {
        const mockPRs = [
            SAMPLE_PULL_REQUESTS.openMergeable,
            SAMPLE_PULL_REQUESTS.openWithConflicts,
            SAMPLE_PULL_REQUESTS.merged,
        ];
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue({
            status: 200,
            json: async () => createViewerPullRequestsResponse(mockPRs),
        } as Response);

        const result = await loadPullRequests("valid-token", defaultOptions);

        expect(result.status).toBe("ok");
        expect(result.data?.length).toBe(3);
    });

    it("handles empty pull requests array", async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValue({
            status: 200,
            json: async () => createViewerPullRequestsResponse([]),
        } as Response);

        const result = await loadPullRequests("valid-token", defaultOptions);

        expect(result.status).toBe("ok");
        expect(result.data?.length).toBe(0);
    });

    it("shows error for non-https enterprise URL when showError is true", async () => {
        const result = await loadPullRequests("valid-token", {
            ...defaultOptions,
            url: "http://github.mycompany.com/api/graphql",
            showError: true,
        });

        expect(result.status).toBe("error");
        expect(mockShowError).toHaveBeenCalledOnce();
    });
});

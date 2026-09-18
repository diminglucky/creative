import { describe, expect, it, vi } from "vitest";

import { createJobService } from "./job-service.js";

describe("job cancellation and worker claim", () => {
  it("allows cancellation only while the job is queued", async () => {
    const eq = vi.fn().mockReturnThis();
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq,
      select: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    const client = { from: vi.fn(() => chain) };
    const service = createJobService({
      createUserClient: () => client as never,
      getAdminClient: () => ({}) as never,
      pgmq: {} as never,
    });

    await expect(
      service.cancelJob(
        { id: "user-1", accessToken: "token", email: "", userMetadata: {} },
        "job-1",
      ),
    ).rejects.toMatchObject({ code: "job_not_found" });

    expect(eq).toHaveBeenCalledWith("id", "job-1");
    expect(eq).toHaveBeenCalledWith("status", "queued");
  });

  it("reports whether the worker atomically claimed a queued job", async () => {
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: { id: "job-1" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    const admin = { from: vi.fn(() => chain) };
    const service = createJobService({
      createUserClient: () => ({}) as never,
      getAdminClient: () => admin as never,
      pgmq: {} as never,
    });

    await expect(service.markRunning("job-1")).resolves.toBe(true);
    await expect(service.markRunning("job-2")).resolves.toBe(false);
  });
});

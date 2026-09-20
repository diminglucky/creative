// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFetchOverview,
  mockFetchProviders,
  mockFetchModels,
  mockFetchPlans,
  mockFetchUsers,
  mockFetchOrders,
  mockFetchLedger,
  mockUpdateProvider,
  mockCreateProvider,
  mockUpdateModel,
  mockUpdatePlan,
  mockFetchCreditPackSettings,
  mockUpdateCreditRatio,
  mockCreateCreditPack,
  mockDiscoverProviderModels,
  mockCreateModel,
  mockReplace,
  mockUseAuth,
} = vi.hoisted(() => ({
  mockFetchOverview: vi.fn(),
  mockFetchProviders: vi.fn(),
  mockFetchModels: vi.fn(),
  mockFetchPlans: vi.fn(),
  mockFetchUsers: vi.fn(),
  mockFetchOrders: vi.fn(),
  mockFetchLedger: vi.fn(),
  mockUpdateProvider: vi.fn(),
  mockCreateProvider: vi.fn(),
  mockUpdateModel: vi.fn(),
  mockUpdatePlan: vi.fn(),
  mockFetchCreditPackSettings: vi.fn(),
  mockUpdateCreditRatio: vi.fn(),
  mockCreateCreditPack: vi.fn(),
  mockDiscoverProviderModels: vi.fn(),
  mockCreateModel: vi.fn(),
  mockReplace: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock("../src/lib/auth-context", () => ({ useAuth: mockUseAuth }));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/admin"),
  useRouter: vi.fn(() => ({ replace: mockReplace })),
}));

vi.mock("../src/lib/admin-api", async () => {
  class AdminApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  }

  return {
    AdminApiError,
    fetchAdminOverview: mockFetchOverview,
    fetchAdminProviders: mockFetchProviders,
    fetchAdminModels: mockFetchModels,
    fetchAdminPlans: mockFetchPlans,
    fetchAdminUsers: mockFetchUsers,
    fetchAdminOrders: mockFetchOrders,
    fetchAdminLedger: mockFetchLedger,
    updateAdminProvider: mockUpdateProvider,
    createAdminProvider: mockCreateProvider,
    updateAdminModel: mockUpdateModel,
    updateAdminPlan: mockUpdatePlan,
    fetchAdminCreditPackSettings: mockFetchCreditPackSettings,
    updateAdminCreditRatio: mockUpdateCreditRatio,
    createAdminCreditPack: mockCreateCreditPack,
    updateAdminCreditPack: vi.fn(),
    deleteAdminCreditPack: vi.fn(),
    discoverAdminProviderModels: mockDiscoverProviderModels,
    createAdminModel: mockCreateModel,
  };
});

import AdminLayout from "../src/app/admin/layout";
import AdminPage from "../src/app/admin/page";
import LedgerPage from "../src/app/admin/ledger/page";
import ModelsPage from "../src/app/admin/models/page";
import OrdersPage from "../src/app/admin/orders/page";
import PlansPage from "../src/app/admin/plans/page";
import ProvidersPage from "../src/app/admin/providers/page";
import UsersPage from "../src/app/admin/users/page";
import CreditPacksPage from "../src/app/admin/credit-packs/page";
import { AdminApiError } from "../src/lib/admin-api";

const overview = {
  metrics: {
    revenueFen: 128_900,
    refundFen: 2_400,
    generationCount: 932,
    activeUsers: 147,
  },
  recentAudit: [
    {
      id: "audit-1",
      actorEmail: "root@example.com",
      action: "model.price.updated",
      resourceType: "model",
      resourceId: "imagen-3",
      createdAt: "2026-09-17T08:30:00.000Z",
    },
    {
      id: "audit-2",
      actorEmail: "root@example.com",
      action: "user.balance.adjusted",
      resourceType: "user",
      resourceId: "341a9606-2cc8-40a8-b4a6-a557b49954fb",
      targetUser: { id: "341a9606-2cc8-40a8-b4a6-a557b49954fb", email: "free@test.creative.com", displayName: "Free Tester" },
      createdAt: "2026-09-17T08:31:00.000Z",
    },
  ],
};

function renderAdmin(child: ReactNode) {
  return render(<AdminLayout>{child}</AdminLayout>);
}

describe("admin console", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      loading: false,
      user: { id: "admin-1", email: "root@example.com" },
      session: { access_token: "admin-token" },
    });
    mockFetchOverview.mockResolvedValue(overview);
    mockFetchProviders.mockResolvedValue({ providers: [] });
    mockFetchModels.mockResolvedValue({ models: [] });
    mockFetchPlans.mockResolvedValue({ plans: [] });
    mockFetchUsers.mockResolvedValue({ users: [] });
    mockFetchOrders.mockResolvedValue({ orders: [] });
    mockFetchLedger.mockResolvedValue({ entries: [] });
    mockUpdateProvider.mockResolvedValue(undefined);
    mockCreateProvider.mockResolvedValue(undefined);
    mockUpdateModel.mockResolvedValue(undefined);
    mockUpdatePlan.mockResolvedValue(undefined);
    mockFetchCreditPackSettings.mockResolvedValue({ creditsPerYuan: 10, packs: [] });
    mockUpdateCreditRatio.mockResolvedValue(undefined);
    mockCreateCreditPack.mockResolvedValue(undefined);
    mockDiscoverProviderModels.mockResolvedValue({ models: [{ id: "gpt-image-1", ownedBy: "openai" }] });
    mockCreateModel.mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("redirects unauthenticated visitors to login before loading admin data", async () => {
    mockUseAuth.mockReturnValue({ loading: false, user: null, session: null });

    renderAdmin(<AdminPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
    expect(mockFetchOverview).not.toHaveBeenCalled();
  });

  it("shows an authorization loading state while the admin guard is pending", () => {
    mockFetchOverview.mockReturnValue(new Promise(() => undefined));

    renderAdmin(<AdminPage />);

    expect(screen.getByText("正在验证管理员权限...")).toBeInTheDocument();
  });

  it("blocks authenticated non-admin users", async () => {
    mockFetchOverview.mockRejectedValue(
      new AdminApiError(403, "admin_forbidden", "Administrator access required"),
    );

    renderAdmin(<AdminPage />);

    expect(await screen.findByRole("heading", { name: "无访问权限" })).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalledWith("/login");
  });

  it("renders overview metrics and the recent audit trail", async () => {
    renderAdmin(<AdminPage />);

    expect(await screen.findByText("¥1,289.00")).toBeInTheDocument();
    expect(screen.getByText("更新模型定价")).toBeInTheDocument();
    expect(screen.getAllByText("操作人：root@example.com")).toHaveLength(2);
    expect(screen.getByText("模型：imagen-3")).toBeInTheDocument();
    expect(screen.getByText("用户：Free Tester")).toBeInTheDocument();
    expect(screen.getByText("邮箱：free@test.creative.com")).toBeInTheDocument();
    expect(screen.getByText("用户 ID：341a9606-2cc8-40a8-b4a6-a557b49954fb")).toBeInTheDocument();
    expect(screen.queryByText("model.price.updated")).not.toBeInTheDocument();
  });

  it("shows only masked provider secrets", async () => {
    mockFetchProviders.mockResolvedValue({
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          baseUrl: "https://api.openai.com/v1",
          enabled: true,
          secretMask: "sk-proj-••••8Df2",
          hasSecret: true,
          updatedAt: "2026-09-17T08:30:00.000Z",
        },
      ],
    });

    renderAdmin(<ProvidersPage />);

    const secret = await screen.findByLabelText("更新 API 密钥");
    expect(secret).toHaveAttribute("type", "password");
    expect(secret).toHaveValue("");
    expect(secret).toHaveAttribute("placeholder", "sk-proj-••••8Df2");
    expect(screen.queryByText("sk-proj-super-secret")).not.toBeInTheDocument();
  });

  it("validates provider URLs and saves valid changes", async () => {
    mockFetchProviders.mockResolvedValue({
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          baseUrl: "https://api.openai.com/v1",
          enabled: true,
          secretMask: "sk-••••",
          hasSecret: true,
          updatedAt: "2026-09-17T08:30:00.000Z",
        },
      ],
    });

    renderAdmin(<ProvidersPage />);
    const url = await screen.findByLabelText("OpenAI API 基础地址");
    fireEvent.change(url, { target: { value: "not-a-url" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 OpenAI" }));
    expect(await screen.findByText("请输入有效的 HTTP 或 HTTPS 地址。")).toBeInTheDocument();
    expect(mockUpdateProvider).not.toHaveBeenCalled();

    fireEvent.change(url, { target: { value: "https://gateway.example.com/v1" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 OpenAI" }));
    await waitFor(() => {
      expect(mockUpdateProvider).toHaveBeenCalledWith("admin-token", "openai", {
        baseUrl: "https://gateway.example.com/v1",
        enabled: true,
      });
    });
    expect(await screen.findByText("供应商配置已保存。")).toBeInTheDocument();
  });

  it("discovers and imports an OpenAI-compatible image model with prices", async () => {
    mockFetchProviders.mockResolvedValue({ providers: [{ id: "openai", name: "OpenAI", baseUrl: "https://gateway.example.com/v1", enabled: true, secretMask: "••••test", hasSecret: true }] });
    renderAdmin(<ProvidersPage />);
    fireEvent.click(await screen.findByRole("button", { name: "获取 OpenAI 模型" }));
    expect(await screen.findByText("gpt-image-1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("gpt-image-1 积分价格"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "添加 gpt-image-1" }));
    await waitFor(() => expect(mockCreateModel).toHaveBeenCalledWith("admin-token", expect.objectContaining({ providerId: "openai", modelId: "gpt-image-1", creditPrice: 15, enabled: true })));
  });

  it("offers model discovery and pricing for other configured providers", async () => {
    mockFetchProviders.mockResolvedValue({ providers: [{ id: "volces", name: "Volcengine", baseUrl: "https://ark.example.com/api/v3", enabled: true, secretMask: "已安全加密", hasSecret: true }] });
    renderAdmin(<ProvidersPage />);
    fireEvent.click(await screen.findByRole("button", { name: "获取 Volcengine 模型" }));
    expect(await screen.findByText("gpt-image-1")).toBeInTheDocument();
  });

  it("shows provider save failures instead of failing silently", async () => {
    mockFetchProviders.mockResolvedValue({ providers: [{ id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", enabled: true }] });
    mockUpdateProvider.mockRejectedValue(new Error("未配置加密主密钥"));
    renderAdmin(<ProvidersPage />);
    fireEvent.click(await screen.findByRole("button", { name: "保存 OpenAI" }));
    expect(await screen.findByText("未配置加密主密钥")).toBeInTheDocument();
  });

  it.each([
    ["模型定价", <ModelsPage />],
    ["订阅套餐", <PlansPage />],
    ["用户余额", <UsersPage />],
    ["充值订单", <OrdersPage />],
    ["资金账本", <LedgerPage />],
  ])("renders the %s operational page", async (heading, page) => {
    renderAdmin(page);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("edits model prices instead of rendering raw JSON", async () => {
    mockFetchModels.mockResolvedValue({ models: [{ model_id: "image/model", display_name: "Image Model", generation_type: "image", credit_price: 12, money_price_fen: 120, cost_price_fen: 40, minimum_plan: "starter", enabled: true }] });
    renderAdmin(<ModelsPage />);
    const credits = await screen.findByLabelText("每次生成积分");
    fireEvent.change(credits, { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 Image Model" }));
    await waitFor(() => expect(mockUpdateModel).toHaveBeenCalledWith("admin-token", "image/model", expect.objectContaining({ creditPrice: 15 })));
  });

  it("edits subscription plan price and included credits", async () => {
    mockFetchPlans.mockResolvedValue({ plans: [{ id: "pro", name: "Pro", description: "Professional", monthly_price_fen: 19900, yearly_price_fen: 199000, included_credits: 5000, benefits: [], enabled: true }] });
    renderAdmin(<PlansPage />);
    fireEvent.change(await screen.findByLabelText("月付价格（元）"), { target: { value: "299" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 Pro" }));
    await waitFor(() => expect(mockUpdatePlan).toHaveBeenCalledWith("admin-token", "pro", expect.objectContaining({ monthlyPriceFen: 29900 })));
  });

  it("configures the ratio and bonus credits for a recharge tier", async () => {
    renderAdmin(<CreditPacksPage />);
    fireEvent.change(await screen.findByLabelText("1 元兑换积分"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "保存兑换比例" }));
    await waitFor(() => expect(mockUpdateCreditRatio).toHaveBeenCalledWith("admin-token", 12));
    fireEvent.change(screen.getByLabelText("充值金额（元）"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("赠送积分"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("档位名称"), { target: { value: "100 元档" } });
    fireEvent.change(screen.getByLabelText("Lemon Squeezy Variant ID"), { target: { value: "12345" } });
    expect(screen.getByText(/实际到账 1,400 积分/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新增充值档位" }));
    await waitFor(() => expect(mockCreateCreditPack).toHaveBeenCalledWith("admin-token", expect.objectContaining({ amountFen: 10000, bonusCredits: 200 })));
  });
});

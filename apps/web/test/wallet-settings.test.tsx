// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WalletSection } from "../src/components/wallet-section";

afterEach(cleanup);
describe("wallet settings", () => {
  it("shows a single credit balance and explains subscription and purchased credits", () => {
    render(<WalletSection wallet={{ creditBalance: 120 }}/>);
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText(/所有生成统一使用积分/)).toBeInTheDocument();
    expect(screen.getByText(/订阅套餐积分按月发放/)).toBeInTheDocument();
    expect(screen.getByText(/额外购买的积分永久有效/)).toBeInTheDocument();
    expect(screen.queryByText(/RMB/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});

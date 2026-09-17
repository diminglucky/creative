// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WalletSection } from "../src/components/wallet-section";

afterEach(cleanup);
describe("wallet settings", () => {
  it("defaults to credits and requires an explicit fallback toggle", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(<WalletSection wallet={{ creditBalance: 120, moneyBalanceFen: 3450, preference: { primaryMethod: "credits", autoFallback: false } }} onSave={save}/>);
    expect(screen.getByText("¥34.50")).toBeInTheDocument();
    expect(screen.getByLabelText(/credits first/i)).toBeChecked();
    expect(screen.getByLabelText(/automatic fallback/i)).not.toBeChecked();
    fireEvent.click(screen.getByLabelText(/automatic fallback/i));
    fireEvent.click(screen.getByRole("button", { name: /save payment preference/i }));
    await waitFor(()=>expect(save).toHaveBeenCalledWith({primaryMethod:"credits",autoFallback:true}));
  });
});

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Combobox from "./Combobox";
import { searchStations } from "@/lib/northern/stations";
describe("station combobox", () => {
  it("offers canonical stations and selects one", () => {
    const onChange = vi.fn();
    render(<Combobox label="From" value={null} onChange={onChange} />);
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "cam" },
    });
    fireEvent.click(screen.getByRole("option"));
    expect(onChange).toHaveBeenCalledWith(searchStations("cam")[0]);
  });
  it("supports arrow navigation, enter selection and escape", () => {
    const onChange = vi.fn();
    render(<Combobox label="From" value={null} onChange={onChange} />);
    const box = screen.getByRole("combobox");
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "cam" } });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(box).toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(searchStations("cam")[0]);
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box).toHaveAttribute("aria-expanded", "false");
  });
  it("limits destination choices to supplied direct stations", () => {
    const onChange = vi.fn();
    render(<Combobox label="To" value={null} onChange={onChange} options={[searchStations("bank")[0]!]} />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option")).toHaveTextContent("Bank");
  });
  it("synchronizes a saved selection supplied after mount", () => {
    const onChange = vi.fn();
    const { rerender } = render(<Combobox label="From" value={null} onChange={onChange} />);
    rerender(<Combobox label="From" value={searchStations("cam")[0]!} onChange={onChange} />);
    expect(screen.getByRole("combobox")).toHaveValue("Camden Town");
  });
  it("closes on blur while preserving pointer selection", async () => {
    const onChange = vi.fn();
    render(<Combobox label="From" value={null} onChange={onChange} />);
    const box = screen.getByRole("combobox");
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "cam" } });
    fireEvent.blur(box);
    fireEvent.click(screen.getByRole("option"));
    expect(onChange).toHaveBeenCalledWith(searchStations("cam")[0]);
  });
});

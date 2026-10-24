import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { retainerAbi } from "../botchain/abi";

describe("Retainer ABI matches compiled artifact", () => {
  const artifactPath = join(
    __dirname,
    "..",
    "..",
    "contracts",
    "out",
    "Retainer.sol",
    "Retainer.json"
  );
  const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));
  const contractAbi = artifact.abi as Array<{
    type: string;
    name?: string;
  }>;

  it("contains all functions declared in the compiled contract", () => {
    const contractFunctions = contractAbi
      .filter((item) => item.type === "function")
      .map((item) => item.name);
    const tsFunctions = retainerAbi
      .filter((item) => item.type === "function")
      .map((item) => (item as any).name);

    expect(tsFunctions.sort()).toEqual(contractFunctions.sort());
  });

  it("contains all events declared in the compiled contract", () => {
    const contractEvents = contractAbi
      .filter((item) => item.type === "event")
      .map((item) => item.name);
    const tsEvents = retainerAbi
      .filter((item) => item.type === "event")
      .map((item) => (item as any).name);

    expect(tsEvents.sort()).toEqual(contractEvents.sort());
  });

  it("contains all custom errors declared in the compiled contract", () => {
    const contractErrors = contractAbi
      .filter((item) => item.type === "error")
      .map((item) => item.name);
    const tsErrors = retainerAbi
      .filter((item) => item.type === "error")
      .map((item) => (item as any).name);

    expect(tsErrors.sort()).toEqual(contractErrors.sort());
  });
});

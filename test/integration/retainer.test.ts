import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { retainerAbi } from "@/lib/botchain/abi";
import {
  buildStatement,
  canDraw,
  loadStatement,
  noticeState,
  reference,
} from "@/lib/retainer";
import {
  MAX_MEMO_BYTES,
  MAX_NOTICE,
  MAX_PAGE,
  MAX_SCOPE_BYTES,
  MIN_NOTICE,
} from "@/lib/limits";

const PORT = 8614;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968 as const;

const MNEMONIC = "test test test test test test test test test test test junk";
const accounts = Array.from({ length: 4 }, (_, i) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: i })
);

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

let node: ChildProcess;
let publicClient: any;
let wallets: any[];
let retainerAddress: Address;

function revertDetails(
  err: unknown
): { errorName?: string; args?: readonly unknown[] } | undefined {
  if (!(err instanceof BaseError)) return undefined;
  const found = err.walk(
    (e) =>
      typeof e === "object" &&
      e !== null &&
      "data" in e &&
      Boolean((e as { data?: { errorName?: string } }).data?.errorName)
  ) as { data?: { errorName?: string; args?: readonly unknown[] } } | null;
  return found?.data;
}

beforeAll(async () => {
  node = spawn(
    "anvil",
    ["--port", String(PORT), "--chain-id", String(CHAIN_ID), "--silent"],
    {
      stdio: ["ignore", "ignore", "inherit"],
    }
  );

  publicClient = createPublicClient({
    chain: local,
    transport: http(RPC),
  });

  wallets = accounts.map((acc) =>
    createWalletClient({
      account: acc,
      chain: local,
      transport: http(RPC),
    })
  );

  // Wait for node to be ready
  for (let i = 0; i < 40; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // Deploy Retainer contract
  const retainerArtifact = JSON.parse(
    readFileSync("contracts/out/Retainer.sol/Retainer.json", "utf8")
  );
  const hash = await wallets[0].deployContract({
    abi: retainerAbi,
    bytecode: retainerArtifact.bytecode.object as Hex,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  retainerAddress = receipt.contractAddress!;
});

afterAll(async () => {
  if (node) {
    node.kill();
  }
});

describe("Retainer integration lifecycle", () => {
  it("verifies contract constants match lib/limits", async () => {
    const minNotice = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "MIN_NOTICE",
    });
    const maxNotice = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "MAX_NOTICE",
    });
    const maxScope = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "MAX_SCOPE_BYTES",
    });
    const maxMemo = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "MAX_MEMO_BYTES",
    });
    const maxPage = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "MAX_PAGE",
    });

    expect(minNotice).toBe(MIN_NOTICE);
    expect(maxNotice).toBe(MAX_NOTICE);
    expect(maxScope).toBe(BigInt(MAX_SCOPE_BYTES));
    expect(maxMemo).toBe(BigInt(MAX_MEMO_BYTES));
    expect(maxPage).toBe(BigInt(MAX_PAGE));
  });

  it("opens a retainer agreement and records initial state", async () => {
    const client = wallets[0];
    const provider = accounts[1].address;

    const hash = await client.writeContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "open",
      args: [provider, 86400n * 7n, "E-commerce rebrand sprint"],
      value: parseEther("5"),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    const count = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "agreementCount",
    });
    expect(count).toBe(1n);

    const agreement = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "agreementOf",
      args: [1n],
    });

    expect(agreement.id).toBe(1n);
    expect(agreement.client.toLowerCase()).toBe(accounts[0].address.toLowerCase());
    expect(agreement.provider.toLowerCase()).toBe(provider.toLowerCase());
    expect(agreement.balance).toBe(parseEther("5"));
    expect(agreement.totalDrawn).toBe(0n);
    expect(agreement.draws).toBe(0);
    expect(agreement.state).toBe(0); // Open
    expect(agreement.noticeStartedAt).toBe(0n);
  });

  it("tops up the retainer and increases balance", async () => {
    const client = wallets[0];

    const hash = await client.writeContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "topUp",
      args: [1n],
      value: parseEther("2"),
    });

    await publicClient.waitForTransactionReceipt({ hash });

    const agreement = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "agreementOf",
      args: [1n],
    });

    expect(agreement.balance).toBe(parseEther("7"));
  });

  it("provider draws against retainer with a memo", async () => {
    const providerWallet = wallets[1];
    const provBefore = await publicClient.getBalance({ address: accounts[1].address });

    const hash = await providerWallet.writeContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "draw",
      args: [1n, parseEther("1.5"), "Sprint 1 deliverables & assets"],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;

    const provAfter = await publicClient.getBalance({ address: accounts[1].address });
    expect(provAfter - provBefore + gasUsed).toBe(parseEther("1.5"));

    const agreement = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "agreementOf",
      args: [1n],
    });

    expect(agreement.balance).toBe(parseEther("5.5"));
    expect(agreement.totalDrawn).toBe(parseEther("1.5"));
    expect(agreement.draws).toBe(1);
  });

  it("enforces guards on draw: InsufficientBalance, NotProvider, MemoTooLong", async () => {
    const providerWallet = wallets[1];
    const strangerWallet = wallets[2];

    // InsufficientBalance
    await expect(
      providerWallet.writeContract({
        address: retainerAddress,
        abi: retainerAbi,
        functionName: "draw",
        args: [1n, parseEther("10"), "Too much"],
      })
    ).rejects.toThrow();

    // NotProvider
    await expect(
      strangerWallet.writeContract({
        address: retainerAddress,
        abi: retainerAbi,
        functionName: "draw",
        args: [1n, parseEther("1"), "Unauthorized"],
      })
    ).rejects.toThrow();

    // MemoTooLong
    await expect(
      providerWallet.writeContract({
        address: retainerAddress,
        abi: retainerAbi,
        functionName: "draw",
        args: [1n, parseEther("1"), "M".repeat(101)],
      })
    ).rejects.toThrow();
  });

  it("handles notice lifecycle: give notice, cancel notice, re-give notice", async () => {
    const clientWallet = wallets[0];

    // Give notice
    let hash = await clientWallet.writeContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "giveNotice",
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    let agreement = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "agreementOf",
      args: [1n],
    });
    expect(agreement.noticeStartedAt).toBeGreaterThan(0n);
    expect(noticeState(agreement)).toBe("pending");

    // Reclaim before notice elapsed reverts
    await expect(
      clientWallet.writeContract({
        address: retainerAddress,
        abi: retainerAbi,
        functionName: "reclaim",
        args: [1n],
      })
    ).rejects.toThrow();

    // Cancel notice
    hash = await clientWallet.writeContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "cancelNotice",
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    agreement = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "agreementOf",
      args: [1n],
    });
    expect(agreement.noticeStartedAt).toBe(0n);
    expect(noticeState(agreement)).toBe("none");

    // Re-give notice
    hash = await clientWallet.writeContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "giveNotice",
      args: [1n],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    agreement = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "agreementOf",
      args: [1n],
    });
    expect(agreement.noticeStartedAt).toBeGreaterThan(0n);
  });

  it("allows provider to draw while notice is running", async () => {
    const providerWallet = wallets[1];

    const hash = await providerWallet.writeContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "draw",
      args: [1n, parseEther("1"), "Notice period wrap-up"],
    });

    await publicClient.waitForTransactionReceipt({ hash });

    const agreement = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "agreementOf",
      args: [1n],
    });

    expect(agreement.balance).toBe(parseEther("4.5"));
    expect(agreement.totalDrawn).toBe(parseEther("2.5"));
    expect(agreement.draws).toBe(2);
  });

  it("client reclaims remainder after notice period has elapsed", async () => {
    const clientWallet = wallets[0];

    // Fast-forward 8 days (notice period is 7 days)
    await publicClient.request({
      method: "evm_increaseTime",
      params: [86400 * 8],
    });
    await publicClient.request({ method: "evm_mine", params: [] });

    const block = await publicClient.getBlock();
    const agreementBefore = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "agreementOf",
      args: [1n],
    });
    expect(noticeState(agreementBefore, Number(block.timestamp))).toBe("elapsed");

    const clientPreBal = await publicClient.getBalance({ address: accounts[0].address });

    const hash = await clientWallet.writeContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "reclaim",
      args: [1n],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;

    const clientPostBal = await publicClient.getBalance({ address: accounts[0].address });
    expect(clientPostBal - clientPreBal + gasUsed).toBe(parseEther("4.5"));

    const agreementAfter = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "agreementOf",
      args: [1n],
    });

    expect(agreementAfter.balance).toBe(0n);
    expect(agreementAfter.state).toBe(1); // Reclaimed
  });

  it("early release and withdraw pending funds", async () => {
    const client = wallets[0];
    const providerWallet = wallets[1];

    // Open agreement #2
    let hash = await client.writeContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "open",
      args: [accounts[1].address, 86400n * 14n, "SEO review"],
      value: parseEther("3"),
    });
    await publicClient.waitForTransactionReceipt({ hash });

    // Provider draws 1 BOT
    hash = await providerWallet.writeContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "draw",
      args: [2n, parseEther("1"), "Initial audit report"],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    // Provider releases early (2 BOT remaining)
    hash = await providerWallet.writeContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "release",
      args: [2n],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const agreement2 = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "agreementOf",
      args: [2n],
    });
    expect(agreement2.state).toBe(2); // Released
    expect(agreement2.balance).toBe(0n);

    const pending = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "pending",
      args: [accounts[0].address],
    });
    expect(pending).toBe(parseEther("2"));

    // Client withdraws pending
    const clientPre = await publicClient.getBalance({ address: accounts[0].address });
    hash = await client.writeContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "withdraw",
      args: [],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const gasUsed = receipt.gasUsed * receipt.effectiveGasPrice;

    const clientPost = await publicClient.getBalance({ address: accounts[0].address });
    expect(clientPost - clientPre + gasUsed).toBe(parseEther("2"));
  });

  it("reconstructs statement from logs and verifies final running balance equals agreement balance", async () => {
    // Agreement #1 was 5 BOT + 2 topup - 1.5 draw - 1 draw - 4.5 reclaim = 0
    const statement1 = await loadStatement(publicClient, retainerAddress, 1n, 0n);
    expect(statement1.rows.length).toBe(5);
    expect(statement1.balance).toBe(0n);

    // Agreement #2 was 3 BOT - 1 draw - 2 release = 0
    const statement2 = await loadStatement(publicClient, retainerAddress, 2n, 0n);
    expect(statement2.rows.length).toBe(3);
    expect(statement2.balance).toBe(0n);
  });

  it("paginates agreementsFor in newest-first order for both client and provider", async () => {
    const clientList = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "agreementsFor",
      args: [accounts[0].address, 0n, 10n],
    });
    expect(clientList.length).toBe(2);
    expect(clientList[0].id).toBe(2n);
    expect(clientList[1].id).toBe(1n);

    const providerList = await publicClient.readContract({
      address: retainerAddress,
      abi: retainerAbi,
      functionName: "agreementsFor",
      args: [accounts[1].address, 0n, 10n],
    });
    expect(providerList.length).toBe(2);
    expect(providerList[0].id).toBe(2n);
    expect(providerList[1].id).toBe(1n);
  });
});

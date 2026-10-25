/**
 * Local stack runner and seeder for Retainer.
 *
 * Spawns anvil on port 8714 with chain id 968, deploys Retainer,
 * and seeds the 6 scenarios from 14-retainer.md §5:
 * (1) account 0 client / account 1 provider: 5 BOT retainer, 4 draws with memos, top-up, no notice
 * (2) account 0 client, notice served and elapsed (reclaimable)
 * (3) notice served, 3 days left
 * (4) account 0 provider, 2 BOT with 1 draw
 * (5) reclaimed
 * (6) released with pending for the client.
 *
 * Usage:
 *   node scripts/local-stack.mjs
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  parseEther,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";

const PORT = 8714;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const MNEMONIC = "test test test test test test test test test test test junk";

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}

const TOTAL_WARP = 86400 * 8 + 86400 * 2;
const realNow = Math.floor(Date.now() / 1000);
const startTimestamp = realNow - TOTAL_WARP;

console.log(`Starting anvil on port ${PORT} (timestamp: ${startTimestamp})...`);
spawn(
  "anvil",
  [
    "--port",
    String(PORT),
    "--chain-id",
    String(CHAIN_ID),
    "--accounts",
    "10",
    "--timestamp",
    String(startTimestamp),
    "--silent",
  ],
  {
    detached: true,
    stdio: "ignore",
  }
).unref();

const pub = createPublicClient({ chain: local, transport: http() });

const accounts = Array.from({ length: 10 }, (_, i) =>
  mnemonicToAccount(MNEMONIC, { addressIndex: i })
);

const wallets = accounts.map((account) =>
  createWalletClient({ account, chain: local, transport: http() })
);

async function waitNode() {
  for (let i = 0; i < 40; i++) {
    try {
      await pub.getBlockNumber();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("Local anvil node failed to respond.");
}

async function main() {
  await waitNode();
  console.log("Anvil running.");

  const retainerArtifact = JSON.parse(
    readFileSync("contracts/out/Retainer.sol/Retainer.json", "utf8")
  );
  const abi = retainerArtifact.abi;
  const bytecode = retainerArtifact.bytecode.object;

  console.log("Deploying Retainer...");
  const deployHash = await wallets[0].deployContract({ abi, bytecode });
  const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployHash });
  const retainerAddress = getAddress(deployReceipt.contractAddress);
  const deployBlock = deployReceipt.blockNumber;
  console.log(`Retainer deployed at ${retainerAddress} (block ${deployBlock})`);

  // Helper for tx confirmation
  async function exec(wallet, fnName, args, value = 0n) {
    const hash = await wallet.writeContract({
      address: retainerAddress,
      abi,
      functionName: fnName,
      args,
      value,
    });
    return await pub.waitForTransactionReceipt({ hash });
  }

  console.log("Seeding scenarios...");

  // Scenario 1: account 0 client / account 1 provider: 5 BOT retainer, 4 draws with memos, top-up, no notice
  console.log("1. Account 0 client / Account 1 provider: 5 BOT, 4 draws, top-up...");
  await exec(wallets[0], "open", [accounts[1].address, 86400n * 14n, "Full-stack mobile app MVP"], parseEther("5"));
  await exec(wallets[1], "draw", [1n, parseEther("0.8"), "Sprint 1: Architecture & database schema"]);
  await exec(wallets[1], "draw", [1n, parseEther("1.2"), "Sprint 2: Auth & core API endpoints"]);
  await exec(wallets[0], "topUp", [1n], parseEther("2.0"));
  await exec(wallets[1], "draw", [1n, parseEther("1.0"), "Sprint 3: UI screens & state sync"]);
  await exec(wallets[1], "draw", [1n, parseEther("0.5"), "Sprint 4: Integration testing & QA"]);

  // Scenario 2: account 0 client: notice served and elapsed (reclaimable)
  console.log("2. Account 0 client: notice served and elapsed (reclaimable)...");
  await exec(wallets[0], "open", [accounts[2].address, 86400n * 7n, "Brand guidelines & asset pack"], parseEther("4"));
  await exec(wallets[2], "draw", [2n, parseEther("1.5"), "Initial color palette & typography exploration"]);
  await exec(wallets[0], "giveNotice", [2n]);

  // Scenario 3: notice served, 3 days left
  console.log("3. Notice served, 3 days left...");
  await exec(wallets[0], "open", [accounts[3].address, 86400n * 13n, "Smart contract security audit"], parseEther("6"));
  await exec(wallets[3], "draw", [3n, parseEther("2.0"), "Automated testing & static analysis scan"]);
  await exec(wallets[0], "giveNotice", [3n]);

  // Advance time so scenario 2 has elapsed (> 7 days, e.g. 8 days) while scenario 3 (10 days total) has 2-3 days left
  await pub.request({ method: "evm_increaseTime", params: [86400 * 8] });
  await pub.request({ method: "evm_mine", params: [] });

  // Scenario 4: account 0 provider, 2 BOT with 1 draw
  console.log("4. Account 0 provider, 2 BOT with 1 draw...");
  await exec(wallets[1], "open", [accounts[0].address, 86400n * 30n, "Developer relations & technical writing"], parseEther("2"));
  await exec(wallets[0], "draw", [4n, parseEther("0.5"), "Documentation audit & getting started guide"]);

  // Scenario 5: reclaimed
  console.log("5. Reclaimed agreement...");
  await exec(wallets[0], "open", [accounts[1].address, 86400n * 1n, "Short graphic design task"], parseEther("1.5"));
  await exec(wallets[1], "draw", [5n, parseEther("0.5"), "Vector logos delivered"]);
  await exec(wallets[0], "giveNotice", [5n]);
  await pub.request({ method: "evm_increaseTime", params: [86400 * 2] });
  await pub.request({ method: "evm_mine", params: [] });
  await exec(wallets[0], "reclaim", [5n]);

  // Scenario 6: released with pending for the client
  console.log("6. Released agreement with pending for client...");
  await exec(wallets[0], "open", [accounts[2].address, 86400n * 14n, "Performance optimization sprint"], parseEther("3"));
  await exec(wallets[2], "draw", [6n, parseEther("0.6"), "Profiling & benchmark baseline"]);
  await exec(wallets[2], "release", [6n]);

  console.log("\nDone! Seeded 6 agreements successfully.");

  // Assert final chain time is within 120s of wall clock
  const finalBlock = await pub.getBlock();
  const currentWallTime = Math.floor(Date.now() / 1000);
  const diff = Math.abs(Number(finalBlock.timestamp) - currentWallTime);
  console.log(`Final chain timestamp: ${finalBlock.timestamp} (real: ${currentWallTime}, diff: ${diff}s)`);
  if (diff > 120) {
    throw new Error(`Chain timestamp skewed by ${diff}s, expected <= 120s`);
  }

  // Write .env.local
  const envContent = [
    `NEXT_PUBLIC_BOTCHAIN_NETWORK=testnet`,
    `NEXT_PUBLIC_BOHR_RPC=${RPC}`,
    `NEXT_PUBLIC_CONTRACT_968=${retainerAddress}`,
    `NEXT_PUBLIC_DEPLOY_BLOCK_968=${deployBlock}`,
    `NEXT_PUBLIC_CHAIN_ID=968`,
    `NEXT_PUBLIC_RPC_URL=${RPC}`,
  ].join("\n");
  writeFileSync(".env.local", envContent + "\n");
  console.log("Updated .env.local with deployed contract addresses.");

  console.log("\n========================================================");
  console.log(`Retainer Local Stack Running on ${RPC}`);
  console.log("========================================================");
  console.log("Account Role Table:");
  console.log("--------------------------------------------------------");
  console.log(`Acc 0: ${accounts[0].address} (Client of #1, #2, #3, #5, #6; Provider of #4)`);
  console.log(`Acc 1: ${accounts[1].address} (Provider of #1, #5; Client of #4)`);
  console.log(`Acc 2: ${accounts[2].address} (Provider of #2, #6)`);
  console.log(`Acc 3: ${accounts[3].address} (Provider of #3)`);
  console.log("--------------------------------------------------------");
  console.log("Seeded scenarios:");
  console.log("1. Acc 0 client / Acc 1 provider: 5 BOT, 4 draws, top-up, active");
  console.log("2. Acc 0 client: notice served and elapsed (reclaimable)");
  console.log("3. Acc 0 client: notice served, ~2 days left");
  console.log("4. Acc 0 provider, 2 BOT with 1 draw");
  console.log("5. Reclaimed agreement");
  console.log("6. Released agreement with pending for client");
  console.log("--------------------------------------------------------");
  console.log("Local stack ready!");
}

main().catch((err) => {
  console.error("Error in local-stack:", err);
  process.exit(1);
});

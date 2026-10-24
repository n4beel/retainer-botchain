// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test} from "forge-std/Test.sol";
import {Retainer} from "../src/Retainer.sol";

contract MaliciousRecipient {
  Retainer public retainer;
  bool public attackDraw;
  bool public attackReclaim;
  bool public attackWithdraw;
  uint256 public targetId;

  constructor(Retainer _retainer) {
    retainer = _retainer;
  }

  function setAttack(bool _draw, bool _reclaim, bool _withdraw, uint256 _id) external {
    attackDraw = _draw;
    attackReclaim = _reclaim;
    attackWithdraw = _withdraw;
    targetId = _id;
  }

  receive() external payable {
    if (attackDraw) {
      attackDraw = false;
      retainer.draw(targetId, 1, "reenter");
    }
    if (attackReclaim) {
      attackReclaim = false;
      retainer.reclaim(targetId);
    }
    if (attackWithdraw) {
      attackWithdraw = false;
      retainer.withdraw();
    }
  }
}

contract RetainerTest is Test {
  Retainer public retainer;

  address public client = address(0xAA11);
  address public provider = address(0xBB22);
  address public stranger = address(0xCC33);

  uint64 public constant ONE_WEEK = 7 days;
  string public constant DEFAULT_SCOPE = "Design system & branding sprint";

  event Opened(uint256 indexed id, address indexed client, address indexed provider, uint64 noticePeriod, uint128 amount, string scope);
  event ToppedUp(uint256 indexed id, uint128 amount, uint128 balance);
  event Drawn(uint256 indexed id, address indexed provider, uint128 amount, uint128 balance, string memo);
  event NoticeGiven(uint256 indexed id, uint64 effectiveAt);
  event NoticeCancelled(uint256 indexed id);
  event Reclaimed(uint256 indexed id, address indexed client, uint128 amount);
  event Released(uint256 indexed id, uint128 amount);
  event Withdrawn(address indexed who, uint256 amount);

  function setUp() public {
    retainer = new Retainer();
    vm.deal(client, 100 ether);
    vm.deal(provider, 10 ether);
    vm.deal(stranger, 10 ether);
  }

  function test_Open_StoresAndFunds() public {
    vm.prank(client);
    vm.expectEmit(true, true, true, false);
    emit Opened(1, client, provider, ONE_WEEK, 5 ether, DEFAULT_SCOPE);
    uint256 id = retainer.open{value: 5 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    assertEq(id, 1);
    assertEq(retainer.agreementCount(), 1);
    assertEq(address(retainer).balance, 5 ether);

    Retainer.AgreementView memory viewData = retainer.agreementOf(id);
    assertEq(viewData.id, 1);
    assertEq(viewData.client, client);
    assertEq(viewData.provider, provider);
    assertEq(viewData.noticePeriod, ONE_WEEK);
    assertEq(viewData.noticeStartedAt, 0);
    assertEq(viewData.noticeEffectiveAt, 0);
    assertEq(viewData.balance, 5 ether);
    assertEq(viewData.totalDrawn, 0);
    assertEq(viewData.draws, 0);
    assertEq(viewData.state, 0);
    assertEq(viewData.createdBlock, block.number);
  }

  function test_Open_Rejects_Self_ZeroValue_BadNotice_LongScope() public {
    // BadParty: zero provider
    vm.prank(client);
    vm.expectRevert(Retainer.BadParty.selector);
    retainer.open{value: 1 ether}(address(0), ONE_WEEK, DEFAULT_SCOPE);

    // BadParty: provider == client
    vm.prank(client);
    vm.expectRevert(Retainer.BadParty.selector);
    retainer.open{value: 1 ether}(client, ONE_WEEK, DEFAULT_SCOPE);

    // ZeroAmount
    vm.prank(client);
    vm.expectRevert(Retainer.ZeroAmount.selector);
    retainer.open{value: 0}(provider, ONE_WEEK, DEFAULT_SCOPE);

    // BadNotice: < 1 day
    vm.prank(client);
    vm.expectRevert(abi.encodeWithSelector(Retainer.BadNotice.selector, uint64(1 days - 1)));
    retainer.open{value: 1 ether}(provider, uint64(1 days - 1), DEFAULT_SCOPE);

    // BadNotice: > 90 days
    vm.prank(client);
    vm.expectRevert(abi.encodeWithSelector(Retainer.BadNotice.selector, uint64(90 days + 1)));
    retainer.open{value: 1 ether}(provider, uint64(90 days + 1), DEFAULT_SCOPE);

    // ScopeTooLong: > 140 bytes
    bytes memory longScope = new bytes(141);
    for (uint256 i = 0; i < 141; i++) longScope[i] = "a";
    vm.prank(client);
    vm.expectRevert(abi.encodeWithSelector(Retainer.ScopeTooLong.selector, 141, 140));
    retainer.open{value: 1 ether}(provider, ONE_WEEK, string(longScope));
  }

  function test_TopUp_ClientOnly_DoesNotResetNotice() public {
    vm.prank(client);
    uint256 id = retainer.open{value: 2 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    // Non-client top up reverts
    vm.prank(stranger);
    vm.expectRevert(abi.encodeWithSelector(Retainer.NotClient.selector, id, stranger));
    retainer.topUp{value: 1 ether}(id);

    // Zero amount reverts
    vm.prank(client);
    vm.expectRevert(Retainer.ZeroAmount.selector);
    retainer.topUp{value: 0}(id);

    // Give notice
    vm.prank(client);
    retainer.giveNotice(id);
    uint64 noticeTime = uint64(block.timestamp);

    // Top up as client
    vm.prank(client);
    vm.expectEmit(true, false, false, true);
    emit ToppedUp(id, 3 ether, 5 ether);
    retainer.topUp{value: 3 ether}(id);

    Retainer.AgreementView memory viewData = retainer.agreementOf(id);
    assertEq(viewData.balance, 5 ether);
    // Notice started timestamp is NOT reset
    assertEq(viewData.noticeStartedAt, noticeTime);
    assertEq(viewData.noticeEffectiveAt, noticeTime + ONE_WEEK);
  }

  function test_Draw_Pays_Records_Memo() public {
    vm.prank(client);
    uint256 id = retainer.open{value: 5 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    uint256 providerPreBal = provider.balance;

    vm.prank(provider);
    vm.expectEmit(true, true, false, true);
    emit Drawn(id, provider, 1.5 ether, 3.5 ether, "Initial concept sketches");
    retainer.draw(id, 1.5 ether, "Initial concept sketches");

    assertEq(provider.balance - providerPreBal, 1.5 ether);

    Retainer.AgreementView memory viewData = retainer.agreementOf(id);
    assertEq(viewData.balance, 3.5 ether);
    assertEq(viewData.totalDrawn, 1.5 ether);
    assertEq(viewData.draws, 1);
  }

  function test_Draw_Multiple_TotalsMatch() public {
    vm.prank(client);
    uint256 id = retainer.open{value: 10 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    vm.startPrank(provider);
    retainer.draw(id, 1 ether, "Phase 1");
    retainer.draw(id, 2 ether, "Phase 2");
    retainer.draw(id, 3 ether, "Phase 3");
    vm.stopPrank();

    Retainer.AgreementView memory viewData = retainer.agreementOf(id);
    assertEq(viewData.balance, 4 ether);
    assertEq(viewData.totalDrawn, 6 ether);
    assertEq(viewData.draws, 3);
  }

  function test_Draw_OverBalance_Args() public {
    vm.prank(client);
    uint256 id = retainer.open{value: 2 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    vm.prank(provider);
    vm.expectRevert(abi.encodeWithSelector(Retainer.InsufficientBalance.selector, 2 ether, 2.5 ether));
    retainer.draw(id, 2.5 ether, "Too much");
  }

  function test_Draw_NotProvider() public {
    vm.prank(client);
    uint256 id = retainer.open{value: 2 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    vm.prank(client);
    vm.expectRevert(abi.encodeWithSelector(Retainer.NotProvider.selector, id, client));
    retainer.draw(id, 1 ether, "Unauthorized");
  }

  function test_Draw_DuringNotice_Works() public {
    vm.prank(client);
    uint256 id = retainer.open{value: 5 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    vm.prank(client);
    retainer.giveNotice(id);

    // Provider draws during notice period
    vm.prank(provider);
    retainer.draw(id, 2 ether, "Finalizing deliverables");

    Retainer.AgreementView memory viewData = retainer.agreementOf(id);
    assertEq(viewData.balance, 3 ether);
    assertEq(viewData.totalDrawn, 2 ether);
  }

  function test_Reclaim_BeforeNotice_NoNotice() public {
    vm.prank(client);
    uint256 id = retainer.open{value: 3 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    vm.prank(client);
    vm.expectRevert(abi.encodeWithSelector(Retainer.NoNotice.selector, id));
    retainer.reclaim(id);
  }

  function test_Reclaim_DuringNotice_NotServed_Args() public {
    vm.prank(client);
    uint256 id = retainer.open{value: 3 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    vm.prank(client);
    retainer.giveNotice(id);

    // Advance halfway through notice period
    vm.warp(block.timestamp + 3 days);

    uint64 effectiveAt = uint64(block.timestamp - 3 days + ONE_WEEK);
    vm.prank(client);
    vm.expectRevert(abi.encodeWithSelector(Retainer.NoticeNotServed.selector, id, effectiveAt));
    retainer.reclaim(id);
  }

  function test_Reclaim_AfterNotice_Returns() public {
    vm.prank(client);
    uint256 id = retainer.open{value: 4 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    vm.prank(provider);
    retainer.draw(id, 1 ether, "Work");

    vm.prank(client);
    retainer.giveNotice(id);

    // Advance past notice period
    vm.warp(block.timestamp + ONE_WEEK + 1);

    uint256 clientPreBal = client.balance;
    vm.prank(client);
    vm.expectEmit(true, true, false, true);
    emit Reclaimed(id, client, 3 ether);
    retainer.reclaim(id);

    assertEq(client.balance - clientPreBal, 3 ether);

    Retainer.AgreementView memory viewData = retainer.agreementOf(id);
    assertEq(viewData.balance, 0);
    assertEq(viewData.state, 1); // Reclaimed
  }

  function test_CancelNotice_RestartsClock() public {
    vm.prank(client);
    uint256 id = retainer.open{value: 5 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    vm.prank(client);
    retainer.giveNotice(id);

    // Cancel notice
    vm.prank(client);
    vm.expectEmit(true, false, false, false);
    emit NoticeCancelled(id);
    retainer.cancelNotice(id);

    Retainer.AgreementView memory v1 = retainer.agreementOf(id);
    assertEq(v1.noticeStartedAt, 0);
    assertEq(v1.noticeEffectiveAt, 0);

    // Cannot reclaim now
    vm.prank(client);
    vm.expectRevert(abi.encodeWithSelector(Retainer.NoNotice.selector, id));
    retainer.reclaim(id);

    // Advance 10 days
    vm.warp(block.timestamp + 10 days);

    // Give notice again: restarts clock
    vm.prank(client);
    retainer.giveNotice(id);

    Retainer.AgreementView memory v2 = retainer.agreementOf(id);
    assertEq(v2.noticeStartedAt, uint64(block.timestamp));
    assertEq(v2.noticeEffectiveAt, uint64(block.timestamp + ONE_WEEK));
  }

  function test_NoticeTwice_Reverts() public {
    vm.prank(client);
    uint256 id = retainer.open{value: 5 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    vm.prank(client);
    retainer.giveNotice(id);

    vm.prank(client);
    vm.expectRevert(abi.encodeWithSelector(Retainer.NoticeAlreadyGiven.selector, id));
    retainer.giveNotice(id);
  }

  function test_Release_CreditsClient_Withdraw() public {
    vm.prank(client);
    uint256 id = retainer.open{value: 6 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    vm.prank(provider);
    retainer.draw(id, 2 ether, "Part 1");

    // Provider releases remaining 4 ether
    vm.prank(provider);
    vm.expectEmit(true, false, false, true);
    emit Released(id, 4 ether);
    retainer.release(id);

    Retainer.AgreementView memory viewData = retainer.agreementOf(id);
    assertEq(viewData.balance, 0);
    assertEq(viewData.state, 2); // Released
    assertEq(retainer.pending(client), 4 ether);

    // Client withdraws pending balance
    uint256 clientPreBal = client.balance;
    vm.prank(client);
    vm.expectEmit(true, false, false, true);
    emit Withdrawn(client, 4 ether);
    retainer.withdraw();

    assertEq(client.balance - clientPreBal, 4 ether);
    assertEq(retainer.pending(client), 0);

    // Double withdraw reverts NothingToWithdraw
    vm.prank(client);
    vm.expectRevert(Retainer.NothingToWithdraw.selector);
    retainer.withdraw();
  }

  function test_ClosedAgreement_AllActionsRevert() public {
    vm.prank(client);
    uint256 id = retainer.open{value: 2 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    vm.prank(client);
    retainer.giveNotice(id);
    vm.warp(block.timestamp + ONE_WEEK + 1);

    vm.prank(client);
    retainer.reclaim(id);

    // State is now 1 (Reclaimed)
    vm.prank(client);
    vm.expectRevert(abi.encodeWithSelector(Retainer.NotOpen.selector, id, 1));
    retainer.topUp{value: 1 ether}(id);

    vm.prank(provider);
    vm.expectRevert(abi.encodeWithSelector(Retainer.NotOpen.selector, id, 1));
    retainer.draw(id, 1, "Closed draw");

    vm.prank(client);
    vm.expectRevert(abi.encodeWithSelector(Retainer.NotOpen.selector, id, 1));
    retainer.giveNotice(id);

    vm.prank(client);
    vm.expectRevert(abi.encodeWithSelector(Retainer.NotOpen.selector, id, 1));
    retainer.reclaim(id);

    vm.prank(provider);
    vm.expectRevert(abi.encodeWithSelector(Retainer.NotOpen.selector, id, 1));
    retainer.release(id);
  }

  function test_AgreementsFor_BothRoles_Pagination() public {
    vm.startPrank(client);
    uint256 id1 = retainer.open{value: 1 ether}(provider, ONE_WEEK, "Job 1");
    uint256 id2 = retainer.open{value: 2 ether}(provider, ONE_WEEK, "Job 2");
    uint256 id3 = retainer.open{value: 3 ether}(provider, ONE_WEEK, "Job 3");
    vm.stopPrank();

    // Client view (newest first)
    Retainer.AgreementView[] memory clientList = retainer.agreementsFor(client, 0, 10);
    assertEq(clientList.length, 3);
    assertEq(clientList[0].id, id3);
    assertEq(clientList[1].id, id2);
    assertEq(clientList[2].id, id1);

    // Provider view (newest first)
    Retainer.AgreementView[] memory providerList = retainer.agreementsFor(provider, 0, 2);
    assertEq(providerList.length, 2);
    assertEq(providerList[0].id, id3);
    assertEq(providerList[1].id, id2);

    // Pagination offset
    Retainer.AgreementView[] memory paged = retainer.agreementsFor(provider, 2, 2);
    assertEq(paged.length, 1);
    assertEq(paged[0].id, id1);
  }

  function test_ReentrantProvider() public {
    MaliciousRecipient attacker = new MaliciousRecipient(retainer);
    vm.deal(address(attacker), 1 ether);

    vm.prank(client);
    uint256 id = retainer.open{value: 5 ether}(address(attacker), ONE_WEEK, DEFAULT_SCOPE);

    attacker.setAttack(true, false, false, id);

    vm.prank(address(attacker));
    vm.expectRevert(Retainer.TransferFailed.selector);
    retainer.draw(id, 1 ether, "Attack");
  }

  function test_ReentrantClient_Reclaim() public {
    MaliciousRecipient attacker = new MaliciousRecipient(retainer);
    vm.deal(address(attacker), 10 ether);

    vm.prank(address(attacker));
    uint256 id = retainer.open{value: 5 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);

    vm.prank(address(attacker));
    retainer.giveNotice(id);

    vm.warp(block.timestamp + ONE_WEEK + 1);

    attacker.setAttack(false, true, false, id);

    vm.prank(address(attacker));
    vm.expectRevert(Retainer.TransferFailed.selector);
    retainer.reclaim(id);
  }

  function test_GasCeilings() public {
    vm.prank(client);
    uint256 gasBeforeOpen = gasleft();
    uint256 id = retainer.open{value: 5 ether}(provider, ONE_WEEK, DEFAULT_SCOPE);
    uint256 openGas = gasBeforeOpen - gasleft();
    assertLt(openGas, 230_000, "open gas must be < 230k");

    vm.prank(provider);
    uint256 gasBeforeDraw = gasleft();
    retainer.draw(id, 1 ether, "Bi-weekly design review & asset export");
    uint256 drawGas = gasBeforeDraw - gasleft();
    assertLt(drawGas, 70_000, "draw gas must be < 70k");

    vm.prank(client);
    retainer.giveNotice(id);
    vm.warp(block.timestamp + ONE_WEEK + 1);

    vm.prank(client);
    uint256 gasBeforeReclaim = gasleft();
    retainer.reclaim(id);
    uint256 reclaimGas = gasBeforeReclaim - gasleft();
    assertLt(reclaimGas, 60_000, "reclaim gas must be < 60k");
  }

  function invariant_BalanceEqualsOpenPlusPending() public view {
    uint256 count = retainer.agreementCount();
    uint256 sumOpen = 0;
    for (uint256 i = 1; i <= count; i++) {
      Retainer.AgreementView memory a = retainer.agreementOf(i);
      if (a.state == 0) {
        sumOpen += a.balance;
      }
    }
    uint256 sumPending = retainer.pending(client) + retainer.pending(provider) + retainer.pending(stranger);
    assertEq(address(retainer).balance, sumOpen + sumPending);
  }

  function testFuzz_ConservationOverSequences(
    uint64 openAmt,
    uint64 topUpAmt,
    uint64 drawAmt1,
    uint64 drawAmt2,
    bool doRelease
  ) public {
    vm.assume(openAmt > 0 && openAmt < 10 ether);
    vm.assume(topUpAmt < 10 ether);

    vm.prank(client);
    uint256 id = retainer.open{value: openAmt}(provider, ONE_WEEK, DEFAULT_SCOPE);

    if (topUpAmt > 0) {
      vm.prank(client);
      retainer.topUp{value: topUpAmt}(id);
    }

    uint256 totalDeposited = uint256(openAmt) + uint256(topUpAmt);

    uint256 avail1 = retainer.agreementOf(id).balance;
    uint256 d1 = drawAmt1 % (avail1 + 1);
    if (d1 > 0) {
      vm.prank(provider);
      // forge-lint: disable-next-line(unsafe-typecast)
      retainer.draw(id, uint128(d1), "draw 1");
    }

    uint256 avail2 = retainer.agreementOf(id).balance;
    uint256 d2 = drawAmt2 % (avail2 + 1);
    if (d2 > 0) {
      vm.prank(provider);
      // forge-lint: disable-next-line(unsafe-typecast)
      retainer.draw(id, uint128(d2), "draw 2");
    }

    uint256 drawn = d1 + d2;
    uint256 rem = retainer.agreementOf(id).balance;
    assertEq(drawn + rem, totalDeposited, "drawn + balance == totalDeposited");

    if (doRelease) {
      vm.prank(provider);
      retainer.release(id);
      assertEq(retainer.pending(client), rem);
      vm.prank(client);
      if (rem > 0) {
        retainer.withdraw();
      }
    } else {
      vm.prank(client);
      retainer.giveNotice(id);
      vm.warp(block.timestamp + ONE_WEEK + 1);
      vm.prank(client);
      retainer.reclaim(id);
    }

    Retainer.AgreementView memory finalView = retainer.agreementOf(id);
    assertEq(finalView.balance, 0);
    assertEq(finalView.totalDrawn, drawn);
  }
}

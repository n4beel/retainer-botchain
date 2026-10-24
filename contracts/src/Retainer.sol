// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/// @title Retainer
/// @notice A client deposits a retainer with a provider. The provider draws from it
///         as work is done, each draw carrying a memo. The client can top up.
///         To reclaim unspent balance, the client serves notice; once elapsed,
///         they can reclaim the remainder. The provider can also release early.
///
/// What it cannot do:
/// - While open, the provider can draw any amount up to the balance at any time.
///   There is no per-draw approval; the client's protection is the notice period.
/// - The client's funds are locked until notice is served and elapsed.
/// - It does not verify work was done or that memos are truthful.
/// - No on-chain arbitration or dispute resolution.
contract Retainer {
  uint64 public constant MIN_NOTICE = 1 days;
  uint64 public constant MAX_NOTICE = 90 days;
  uint256 public constant MAX_SCOPE_BYTES = 140;
  uint256 public constant MAX_MEMO_BYTES = 100;
  uint256 public constant MAX_PAGE = 50;

  struct Agreement {
    address client;          // 20 bytes ┐ slot 1
    uint64  noticePeriod;    //  8 bytes │
    uint32  createdBlock;    //  4 bytes ┘
    address provider;        // 20 bytes ┐ slot 2
    uint64  noticeStartedAt; //  8 bytes │ 0 = no notice served
    uint16  draws;           //  2 bytes │
    uint8   state;           //  1 byte  ┘ 0: Open, 1: Reclaimed, 2: Released
    uint128 balance;         // 16 bytes ┐ slot 3
    uint128 totalDrawn;      // 16 bytes ┘
  }

  struct AgreementView {
    uint256 id;
    address client;
    address provider;
    uint64 noticePeriod;
    uint64 noticeStartedAt;
    uint64 noticeEffectiveAt;
    uint128 balance;
    uint128 totalDrawn;
    uint16 draws;
    uint8 state;
    uint32 createdBlock;
  }

  mapping(uint256 => Agreement) private _agreements;
  mapping(address => uint256[]) private _idsFor;
  mapping(address => uint256) public pending;
  uint256 public agreementCount;

  uint256 private _lock = 1;

  modifier nonReentrant() {
    if (_lock != 1) revert TransferFailed();
    _lock = 2;
    _;
    _lock = 1;
  }

  // --- Events ---
  event Opened(uint256 indexed id, address indexed client, address indexed provider, uint64 noticePeriod, uint128 amount, string scope);
  event ToppedUp(uint256 indexed id, uint128 amount, uint128 balance);
  event Drawn(uint256 indexed id, address indexed provider, uint128 amount, uint128 balance, string memo);
  event NoticeGiven(uint256 indexed id, uint64 effectiveAt);
  event NoticeCancelled(uint256 indexed id);
  event Reclaimed(uint256 indexed id, address indexed client, uint128 amount);
  event Released(uint256 indexed id, uint128 amount);
  event Withdrawn(address indexed who, uint256 amount);

  // --- Errors ---
  error BadParty();
  error ZeroAmount();
  error AmountTooLarge();
  error BadNotice(uint64 noticePeriod);
  error ScopeTooLong(uint256 length, uint256 max);
  error MemoTooLong(uint256 length, uint256 max);
  error NoSuchAgreement(uint256 id);
  error NotOpen(uint256 id, uint8 state);
  error NotClient(uint256 id, address caller);
  error NotProvider(uint256 id, address caller);
  error InsufficientBalance(uint256 balance, uint256 requested);
  error NoticeAlreadyGiven(uint256 id);
  error NoNotice(uint256 id);
  error NoticeNotServed(uint256 id, uint64 effectiveAt);
  error NothingToWithdraw();
  error TransferFailed();

  /// @notice Open a new retainer agreement with a provider.
  function open(address provider, uint64 noticePeriod, string calldata scope) external payable returns (uint256 id) {
    if (provider == address(0) || provider == msg.sender) revert BadParty();
    if (msg.value == 0) revert ZeroAmount();
    if (msg.value > type(uint128).max) revert AmountTooLarge();
    if (noticePeriod < MIN_NOTICE || noticePeriod > MAX_NOTICE) revert BadNotice(noticePeriod);
    if (bytes(scope).length > MAX_SCOPE_BYTES) revert ScopeTooLong(bytes(scope).length, MAX_SCOPE_BYTES);

    id = ++agreementCount;
    _agreements[id] = Agreement({
      client: msg.sender,
      noticePeriod: noticePeriod,
      createdBlock: uint32(block.number),
      provider: provider,
      noticeStartedAt: 0,
      draws: 0,
      state: 0,
      balance: uint128(msg.value),
      totalDrawn: 0
    });

    _idsFor[msg.sender].push(id);
    _idsFor[provider].push(id);

    emit Opened(id, msg.sender, provider, noticePeriod, uint128(msg.value), scope);
  }

  /// @notice Add funds to an open retainer. Does not reset a served notice.
  function topUp(uint256 id) external payable {
    Agreement storage a = _agreements[id];
    if (a.client == address(0)) revert NoSuchAgreement(id);
    if (a.state != 0) revert NotOpen(id, a.state);
    if (msg.sender != a.client) revert NotClient(id, msg.sender);
    if (msg.value == 0) revert ZeroAmount();
    if (uint256(a.balance) + msg.value > type(uint128).max) revert AmountTooLarge();

    a.balance += uint128(msg.value);

    emit ToppedUp(id, uint128(msg.value), a.balance);
  }

  /// @notice Provider draws funds against work done, accompanied by a memo.
  function draw(uint256 id, uint128 amount, string calldata memo) external nonReentrant {
    Agreement storage a = _agreements[id];
    if (a.client == address(0)) revert NoSuchAgreement(id);
    if (a.state != 0) revert NotOpen(id, a.state);
    if (msg.sender != a.provider) revert NotProvider(id, msg.sender);
    if (amount == 0) revert ZeroAmount();
    if (amount > a.balance) revert InsufficientBalance(a.balance, amount);
    if (bytes(memo).length > MAX_MEMO_BYTES) revert MemoTooLong(bytes(memo).length, MAX_MEMO_BYTES);

    a.balance -= amount;
    a.totalDrawn += amount;
    a.draws++;

    (bool ok, ) = a.provider.call{value: amount}("");
    if (!ok) revert TransferFailed();

    emit Drawn(id, a.provider, amount, a.balance, memo);
  }

  /// @notice Client serves notice to start the reclaim countdown.
  function giveNotice(uint256 id) external {
    Agreement storage a = _agreements[id];
    if (a.client == address(0)) revert NoSuchAgreement(id);
    if (a.state != 0) revert NotOpen(id, a.state);
    if (msg.sender != a.client) revert NotClient(id, msg.sender);
    if (a.noticeStartedAt != 0) revert NoticeAlreadyGiven(id);

    a.noticeStartedAt = uint64(block.timestamp);
    uint64 effectiveAt = uint64(block.timestamp) + a.noticePeriod;

    emit NoticeGiven(id, effectiveAt);
  }

  /// @notice Client cancels a previously served notice. The clock restarts if given again.
  function cancelNotice(uint256 id) external {
    Agreement storage a = _agreements[id];
    if (a.client == address(0)) revert NoSuchAgreement(id);
    if (a.state != 0) revert NotOpen(id, a.state);
    if (msg.sender != a.client) revert NotClient(id, msg.sender);
    if (a.noticeStartedAt == 0) revert NoNotice(id);

    a.noticeStartedAt = 0;

    emit NoticeCancelled(id);
  }

  /// @notice Client reclaims remaining balance after the notice period has elapsed.
  function reclaim(uint256 id) external nonReentrant {
    Agreement storage a = _agreements[id];
    if (a.client == address(0)) revert NoSuchAgreement(id);
    if (a.state != 0) revert NotOpen(id, a.state);
    if (msg.sender != a.client) revert NotClient(id, msg.sender);
    if (a.noticeStartedAt == 0) revert NoNotice(id);

    uint64 effectiveAt = a.noticeStartedAt + a.noticePeriod;
    // forge-lint: disable-next-line(block-timestamp)
    if (block.timestamp < effectiveAt) revert NoticeNotServed(id, effectiveAt);

    a.state = 1; // Reclaimed
    uint128 rem = a.balance;
    a.balance = 0;

    if (rem > 0) {
      (bool ok, ) = a.client.call{value: rem}("");
      if (!ok) revert TransferFailed();
    }

    emit Reclaimed(id, a.client, rem);
  }

  /// @notice Provider releases the retainer, crediting remaining balance to pending[client].
  function release(uint256 id) external {
    Agreement storage a = _agreements[id];
    if (a.client == address(0)) revert NoSuchAgreement(id);
    if (a.state != 0) revert NotOpen(id, a.state);
    if (msg.sender != a.provider) revert NotProvider(id, msg.sender);

    a.state = 2; // Released
    uint128 rem = a.balance;
    a.balance = 0;
    pending[a.client] += rem;

    emit Released(id, rem);
  }

  /// @notice Withdraw pending funds credited from early releases.
  function withdraw() external nonReentrant {
    uint256 amount = pending[msg.sender];
    if (amount == 0) revert NothingToWithdraw();

    pending[msg.sender] = 0;

    (bool ok, ) = msg.sender.call{value: amount}("");
    if (!ok) revert TransferFailed();

    emit Withdrawn(msg.sender, amount);
  }

  /// @notice View an agreement's full state.
  function agreementOf(uint256 id) external view returns (AgreementView memory) {
    Agreement storage a = _agreements[id];
    if (a.client == address(0)) revert NoSuchAgreement(id);

    uint64 effectiveAt = a.noticeStartedAt == 0 ? 0 : a.noticeStartedAt + a.noticePeriod;

    return AgreementView({
      id: id,
      client: a.client,
      provider: a.provider,
      noticePeriod: a.noticePeriod,
      noticeStartedAt: a.noticeStartedAt,
      noticeEffectiveAt: effectiveAt,
      balance: a.balance,
      totalDrawn: a.totalDrawn,
      draws: a.draws,
      state: a.state,
      createdBlock: a.createdBlock
    });
  }

  /// @notice List agreements involving an address (client or provider), newest first.
  function agreementsFor(address who, uint256 offset, uint256 count) external view returns (AgreementView[] memory) {
    uint256[] storage all = _idsFor[who];
    uint256 total = all.length;
    if (offset >= total || count == 0) return new AgreementView[](0);

    if (count > MAX_PAGE) count = MAX_PAGE;
    if (offset + count > total) count = total - offset;

    AgreementView[] memory res = new AgreementView[](count);
    for (uint256 i = 0; i < count; i++) {
      uint256 idx = total - 1 - (offset + i);
      uint256 id = all[idx];
      Agreement storage a = _agreements[id];
      uint64 eff = a.noticeStartedAt == 0 ? 0 : a.noticeStartedAt + a.noticePeriod;
      res[i] = AgreementView({
        id: id,
        client: a.client,
        provider: a.provider,
        noticePeriod: a.noticePeriod,
        noticeStartedAt: a.noticeStartedAt,
        noticeEffectiveAt: eff,
        balance: a.balance,
        totalDrawn: a.totalDrawn,
        draws: a.draws,
        state: a.state,
        createdBlock: a.createdBlock
      });
    }

    return res;
  }
}

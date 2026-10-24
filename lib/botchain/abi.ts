export const retainerAbi = [
  {
    type: "function",
    name: "MAX_MEMO_BYTES",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "MAX_NOTICE",
    inputs: [],
    outputs: [{ name: "", type: "uint64", internalType: "uint64" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "MAX_PAGE",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "MAX_SCOPE_BYTES",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "MIN_NOTICE",
    inputs: [],
    outputs: [{ name: "", type: "uint64", internalType: "uint64" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "agreementCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "agreementOf",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct Retainer.AgreementView",
        components: [
          { name: "id", type: "uint256", internalType: "uint256" },
          { name: "client", type: "address", internalType: "address" },
          { name: "provider", type: "address", internalType: "address" },
          { name: "noticePeriod", type: "uint64", internalType: "uint64" },
          { name: "noticeStartedAt", type: "uint64", internalType: "uint64" },
          { name: "noticeEffectiveAt", type: "uint64", internalType: "uint64" },
          { name: "balance", type: "uint128", internalType: "uint128" },
          { name: "totalDrawn", type: "uint128", internalType: "uint128" },
          { name: "draws", type: "uint16", internalType: "uint16" },
          { name: "state", type: "uint8", internalType: "uint8" },
          { name: "createdBlock", type: "uint32", internalType: "uint32" }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "agreementsFor",
    inputs: [
      { name: "who", type: "address", internalType: "address" },
      { name: "offset", type: "uint256", internalType: "uint256" },
      { name: "count", type: "uint256", internalType: "uint256" }
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        internalType: "struct Retainer.AgreementView[]",
        components: [
          { name: "id", type: "uint256", internalType: "uint256" },
          { name: "client", type: "address", internalType: "address" },
          { name: "provider", type: "address", internalType: "address" },
          { name: "noticePeriod", type: "uint64", internalType: "uint64" },
          { name: "noticeStartedAt", type: "uint64", internalType: "uint64" },
          { name: "noticeEffectiveAt", type: "uint64", internalType: "uint64" },
          { name: "balance", type: "uint128", internalType: "uint128" },
          { name: "totalDrawn", type: "uint128", internalType: "uint128" },
          { name: "draws", type: "uint16", internalType: "uint16" },
          { name: "state", type: "uint8", internalType: "uint8" },
          { name: "createdBlock", type: "uint32", internalType: "uint32" }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "cancelNotice",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "draw",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "amount", type: "uint128", internalType: "uint128" },
      { name: "memo", type: "string", internalType: "string" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "giveNotice",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "open",
    inputs: [
      { name: "provider", type: "address", internalType: "address" },
      { name: "noticePeriod", type: "uint64", internalType: "uint64" },
      { name: "scope", type: "string", internalType: "string" }
    ],
    outputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "pending",
    inputs: [{ name: "", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "reclaim",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "release",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "topUp",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "event",
    name: "Drawn",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "provider", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint128", indexed: false, internalType: "uint128" },
      { name: "balance", type: "uint128", indexed: false, internalType: "uint128" },
      { name: "memo", type: "string", indexed: false, internalType: "string" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "NoticeCancelled",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "NoticeGiven",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "effectiveAt", type: "uint64", indexed: false, internalType: "uint64" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Opened",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "client", type: "address", indexed: true, internalType: "address" },
      { name: "provider", type: "address", indexed: true, internalType: "address" },
      { name: "noticePeriod", type: "uint64", indexed: false, internalType: "uint64" },
      { name: "amount", type: "uint128", indexed: false, internalType: "uint128" },
      { name: "scope", type: "string", indexed: false, internalType: "string" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Reclaimed",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "client", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint128", indexed: false, internalType: "uint128" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Released",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "amount", type: "uint128", indexed: false, internalType: "uint128" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ToppedUp",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "amount", type: "uint128", indexed: false, internalType: "uint128" },
      { name: "balance", type: "uint128", indexed: false, internalType: "uint128" }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "who", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" }
    ],
    anonymous: false
  },
  {
    type: "error",
    name: "AmountTooLarge",
    inputs: []
  },
  {
    type: "error",
    name: "BadNotice",
    inputs: [
      { name: "noticePeriod", type: "uint64", internalType: "uint64" }
    ]
  },
  {
    type: "error",
    name: "BadParty",
    inputs: []
  },
  {
    type: "error",
    name: "InsufficientBalance",
    inputs: [
      { name: "balance", type: "uint256", internalType: "uint256" },
      { name: "requested", type: "uint256", internalType: "uint256" }
    ]
  },
  {
    type: "error",
    name: "MemoTooLong",
    inputs: [
      { name: "length", type: "uint256", internalType: "uint256" },
      { name: "max", type: "uint256", internalType: "uint256" }
    ]
  },
  {
    type: "error",
    name: "NoNotice",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" }
    ]
  },
  {
    type: "error",
    name: "NoSuchAgreement",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" }
    ]
  },
  {
    type: "error",
    name: "NotClient",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "caller", type: "address", internalType: "address" }
    ]
  },
  {
    type: "error",
    name: "NotOpen",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "state", type: "uint8", internalType: "uint8" }
    ]
  },
  {
    type: "error",
    name: "NotProvider",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "caller", type: "address", internalType: "address" }
    ]
  },
  {
    type: "error",
    name: "NothingToWithdraw",
    inputs: []
  },
  {
    type: "error",
    name: "NoticeAlreadyGiven",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" }
    ]
  },
  {
    type: "error",
    name: "NoticeNotServed",
    inputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "effectiveAt", type: "uint64", internalType: "uint64" }
    ]
  },
  {
    type: "error",
    name: "ScopeTooLong",
    inputs: [
      { name: "length", type: "uint256", internalType: "uint256" },
      { name: "max", type: "uint256", internalType: "uint256" }
    ]
  },
  {
    type: "error",
    name: "TransferFailed",
    inputs: []
  },
  {
    type: "error",
    name: "ZeroAmount",
    inputs: []
  }
] as const;

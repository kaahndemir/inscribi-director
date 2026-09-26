// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Testnet demo: four frozen choices, one paid vote per address per round.
contract StoryVote {
    address public immutable owner;
    uint256 public latestRound;
    uint256 public withdrawable;
    struct Round {
        bytes32 choicesHash;
        uint64 deadline;
        uint128 fee;
        uint256[4] counts;
        uint256 pot;
        uint8 winner; // 255 = no votes
        bool finalized;
        bool cancelled;
    }
    mapping(uint256 => Round) private rounds;
    mapping(uint256 => mapping(address => bool)) public voted;
    mapping(uint256 => mapping(address => bool)) public refunded;
    event Opened(uint256 indexed round, bytes32 choicesHash, uint64 deadline, uint128 fee);
    event Voted(uint256 indexed round, address indexed voter, uint8 choice);
    event Finalized(uint256 indexed round, uint8 winner);
    event Cancelled(uint256 indexed round);
    error Unauthorized();
    error Invalid();
    error Closed();
    error Duplicate();
    error WrongFee();
    error TransferFailed();
    constructor() { owner = msg.sender; }
    modifier onlyOwner() { if (msg.sender != owner) revert Unauthorized(); _; }
    function getRound(uint256 id) external view returns (Round memory) { return rounds[id]; }
    function open(bytes32 choicesHash, uint64 duration, uint128 fee) external onlyOwner returns (uint256 id) {
        if (choicesHash == bytes32(0) || duration == 0 || duration > 1 hours || fee == 0) revert Invalid();
        if (latestRound != 0 && !rounds[latestRound].finalized && !rounds[latestRound].cancelled) revert Closed();
        id = ++latestRound;
        Round storage r = rounds[id];
        r.choicesHash = choicesHash;
        r.deadline = uint64(block.timestamp) + duration;
        r.fee = fee;
        r.winner = 255;
        emit Opened(id, choicesHash, r.deadline, fee);
    }
    function vote(uint256 id, uint8 choice) external payable {
        Round storage r = rounds[id];
        if (r.deadline == 0 || choice > 3) revert Invalid();
        if (r.finalized || r.cancelled || block.timestamp >= r.deadline) revert Closed();
        if (voted[id][msg.sender]) revert Duplicate();
        if (msg.value != r.fee) revert WrongFee();
        voted[id][msg.sender] = true;
        ++r.counts[choice];
        r.pot += msg.value;
        emit Voted(id, msg.sender, choice);
    }
    function finalize(uint256 id) external returns (uint8) {
        Round storage r = rounds[id];
        if (r.deadline == 0 || r.cancelled || block.timestamp < r.deadline) revert Closed();
        if (r.finalized) return r.winner;
        uint256 highest;
        for (uint8 i; i < 4; ++i) if (r.counts[i] > highest) { highest = r.counts[i]; r.winner = i; }
        r.finalized = true;
        withdrawable += r.pot;
        emit Finalized(id, r.winner);
        return r.winner;
    }
    function cancel(uint256 id) external onlyOwner {
        Round storage r = rounds[id];
        if (r.deadline == 0 || r.finalized || r.cancelled) revert Closed();
        r.cancelled = true;
        emit Cancelled(id);
    }
    function refund(uint256 id) external {
        Round storage r = rounds[id];
        if (!r.cancelled || !voted[id][msg.sender] || refunded[id][msg.sender]) revert Invalid();
        refunded[id][msg.sender] = true;
        r.pot -= r.fee;
        (bool ok,) = msg.sender.call{value: r.fee}("");
        if (!ok) revert TransferFailed();
    }
    function withdraw(address payable recipient) external onlyOwner {
        if (recipient == address(0)) revert Invalid();
        uint256 amount = withdrawable;
        withdrawable = 0;
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}

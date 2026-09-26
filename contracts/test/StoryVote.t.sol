// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../src/StoryVote.sol";

contract RejectingReceiver {
    receive() external payable {
        revert();
    }
}

contract StoryVoteTest is Test {
    StoryVote internal vote;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    uint128 internal constant FEE = 0.001 ether;

    function setUp() public {
        vote = new StoryVote();
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vote.open(keccak256("choices"), 30, FEE);
    }

    function cast(address voter, uint8 choice) internal {
        vm.prank(voter);
        vote.vote{value: FEE}(1, choice);
    }

    function endRound() internal {
        vm.warp(block.timestamp + 30);
        vote.finalize(1);
    }

    // Voting

    function testCorrectVote() public {
        cast(alice, 2);
        assertEq(vote.getRound(1).counts[2], 1);
        assertEq(vote.getRound(1).pot, FEE);
    }

    function testWrongChoice() public {
        vm.prank(alice);
        vm.expectRevert(StoryVote.Invalid.selector);
        vote.vote{value: FEE}(1, 4);
    }

    function testUnknownRound() public {
        vm.prank(alice);
        vm.expectRevert(StoryVote.Invalid.selector);
        vote.vote{value: FEE}(9, 0);
    }

    function testWrongFees() public {
        uint256[3] memory values = [uint256(0), FEE - 1, FEE + 1];
        for (uint256 i; i < values.length; ++i) {
            vm.prank(alice);
            vm.expectRevert(StoryVote.WrongFee.selector);
            vote.vote{value: values[i]}(1, 0);
        }
    }

    function testDuplicate() public {
        cast(alice, 1);
        vm.prank(alice);
        vm.expectRevert(StoryVote.Duplicate.selector);
        vote.vote{value: FEE}(1, 3);
        assertEq(vote.getRound(1).pot, FEE);
    }

    function testAtDeadlineRejected() public {
        vm.warp(vote.getRound(1).deadline);
        vm.prank(alice);
        vm.expectRevert(StoryVote.Closed.selector);
        vote.vote{value: FEE}(1, 0);
    }

    function testBeforeDeadlineAccepted() public {
        vm.warp(vote.getRound(1).deadline - 1);
        cast(alice, 0);
    }

    function testNextRoundCanVoteAgain() public {
        cast(alice, 0);
        endRound();
        vote.open(keccak256("next"), 30, FEE);
        vm.prank(alice);
        vote.vote{value: FEE}(2, 1);
        assertEq(vote.getRound(2).counts[1], 1);
    }

    function testVoteWithinGasAllowanceAllChoices() public {
        // The server signs votes with a fixed 150k gas limit; every choice must fit well below it.
        for (uint8 i; i < 4; i++) {
            address voter = address(uint160(100 + i));
            vm.deal(voter, FEE);
            vm.prank(voter);
            vote.vote{value: FEE, gas: 125000}(1, i);
        }
    }

    // Finalizing

    function testZeroRound() public {
        vm.expectRevert(StoryVote.Closed.selector);
        vote.finalize(0);
    }

    function testEarlyFinalizeRejected() public {
        vm.expectRevert(StoryVote.Closed.selector);
        vote.finalize(1);
    }

    function testTieLowestIndex() public {
        cast(alice, 3);
        cast(bob, 1);
        endRound();
        assertEq(vote.getRound(1).winner, 1);
    }

    function testNoVotes() public {
        endRound();
        assertEq(vote.getRound(1).winner, 255);
        assertEq(vote.withdrawable(), 0);
    }

    function testFinalizeIdempotent() public {
        cast(alice, 0);
        endRound();
        vote.finalize(1);
        assertEq(vote.withdrawable(), FEE);
    }

    function testAnyoneCanFinalize() public {
        vm.warp(block.timestamp + 30);
        vm.prank(alice);
        vote.finalize(1);
        assertTrue(vote.getRound(1).finalized);
    }

    // Opening

    function testUnauthorizedOpen() public {
        vm.prank(alice);
        vm.expectRevert(StoryVote.Unauthorized.selector);
        vote.open(keccak256("x"), 30, FEE);
    }

    function testOverlappingRoundRejected() public {
        vm.expectRevert(StoryVote.Closed.selector);
        vote.open(keccak256("x"), 30, FEE);
    }

    function testInvalidOpen() public {
        endRound();
        vm.expectRevert(StoryVote.Invalid.selector);
        vote.open(bytes32(0), 30, FEE);
        vm.expectRevert(StoryVote.Invalid.selector);
        vote.open(keccak256("x"), 0, FEE);
        vm.expectRevert(StoryVote.Invalid.selector);
        vote.open(keccak256("x"), 30, 0);
    }

    // Cancelling and refunds

    function testCancelRefund() public {
        cast(alice, 0);
        vote.cancel(1);
        vm.prank(alice);
        vote.refund(1);
        assertEq(alice.balance, 10 ether);
        assertEq(vote.getRound(1).pot, 0);
        vm.prank(alice);
        vm.expectRevert(StoryVote.Invalid.selector);
        vote.refund(1);
    }

    function testCancelCannotFinalizeOrVote() public {
        vote.cancel(1);
        vm.warp(block.timestamp + 30);
        vm.expectRevert(StoryVote.Closed.selector);
        vote.finalize(1);
        vm.prank(alice);
        vm.expectRevert(StoryVote.Closed.selector);
        vote.vote{value: FEE}(1, 0);
    }

    function testFinalizedCannotCancel() public {
        endRound();
        vm.expectRevert(StoryVote.Closed.selector);
        vote.cancel(1);
    }

    function testRefundRequiresCancellationAndVoter() public {
        cast(alice, 0);
        vm.prank(alice);
        vm.expectRevert(StoryVote.Invalid.selector);
        vote.refund(1);
        vote.cancel(1);
        vm.prank(bob);
        vm.expectRevert(StoryVote.Invalid.selector);
        vote.refund(1);
    }

    function testCancelledEscrowSurvivesLaterWithdrawal() public {
        cast(alice, 0);
        vote.cancel(1);
        vote.open(keccak256("next"), 30, FEE);
        vm.prank(bob);
        vote.vote{value: FEE}(2, 1);
        vm.warp(block.timestamp + 30);
        vote.finalize(2);
        vote.withdraw(payable(bob));
        assertEq(address(vote).balance, FEE);
        vm.prank(alice);
        vote.refund(1);
        assertEq(address(vote).balance, 0);
    }

    // Owner and treasury

    function testUnauthorizedCancelAndWithdraw() public {
        vm.startPrank(alice);
        vm.expectRevert(StoryVote.Unauthorized.selector);
        vote.cancel(1);
        vm.expectRevert(StoryVote.Unauthorized.selector);
        vote.withdraw(payable(alice));
        vm.stopPrank();
    }

    function testCancelledFundsNotWithdrawable() public {
        cast(alice, 0);
        vote.cancel(1);
        vote.withdraw(payable(bob));
        assertEq(address(vote).balance, FEE);
    }

    function testRejectedWithdrawalPreservesFunds() public {
        cast(alice, 0);
        endRound();
        RejectingReceiver receiver = new RejectingReceiver();
        vm.expectRevert(StoryVote.TransferFailed.selector);
        vote.withdraw(payable(address(receiver)));
        assertEq(vote.withdrawable(), FEE);
    }

    // Money is conserved for any number of voters and any distribution of choices.
    function testFuzzConservation(uint8 voters, uint256 seed) public {
        voters = uint8(bound(voters, 1, 80));
        for (uint256 i; i < voters; ++i) {
            address voter = address(uint160(100 + i));
            vm.deal(voter, FEE);
            cast(voter, uint8(uint256(keccak256(abi.encode(seed, i))) % 4));
        }
        endRound();
        assertEq(vote.withdrawable(), uint256(voters) * FEE);

        uint256 total;
        for (uint8 i; i < 4; ++i) total += vote.getRound(1).counts[i];
        assertEq(total, voters);

        uint256 before = bob.balance;
        vote.withdraw(payable(bob));
        assertEq(bob.balance - before, uint256(voters) * FEE);
        assertEq(address(vote).balance, 0);
    }
}

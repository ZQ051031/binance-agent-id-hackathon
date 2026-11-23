// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBoard {
    function registerAgent(string calldata name) external;
    function acceptTask(uint256 taskId) external;
    function completeTask(uint256 taskId, string calldata result) external;
    function claimPayment(uint256 taskId) external;
    function confirmCompletion(uint256 taskId) external;
    function postTask(string calldata title, string calldata description, uint256 deadline)
        external
        payable
        returns (uint256);
    function cancelTask(uint256 taskId) external;
}

/// @notice TEST ONLY. A contract agent used to test reentrancy protection and failed transfers.
contract TestAgent {
    IBoard public board;
    bool public rejectPayments;
    bool public reenter;
    uint256 public reenterTaskId;

    constructor(address board_) {
        board = IBoard(board_);
    }

    function setRejectPayments(bool v) external {
        rejectPayments = v;
    }

    function setReenter(bool v, uint256 taskId) external {
        reenter = v;
        reenterTaskId = taskId;
    }

    function register(string calldata name) external {
        board.registerAgent(name);
    }

    function accept(uint256 taskId) external {
        board.acceptTask(taskId);
    }

    function complete(uint256 taskId, string calldata result) external {
        board.completeTask(taskId, result);
    }

    function claim(uint256 taskId) external {
        board.claimPayment(taskId);
    }

    function post(string calldata title, uint256 deadline) external payable {
        board.postTask{value: msg.value}(title, "", deadline);
    }

    function cancel(uint256 taskId) external {
        board.cancelTask(taskId);
    }

    receive() external payable {
        if (rejectPayments) revert("no thanks");
        if (reenter) {
            reenter = false;
            board.cancelTask(reenterTaskId);
        }
    }
}
